import { useCallback, useEffect, useRef, useState } from 'react';
import { buildWebSocketUrl } from '../lib/api';

const LIVE_INTERVIEW_WS_URL = buildWebSocketUrl('/api/interview/live');
const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;
const PCM_CAPTURE_CHUNK_MS = 80;

function createMessage(role, content, extra = {}) {
  const messageId = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    id: messageId,
    role,
    content,
    ts: extra.ts || Date.now(),
    source: extra.source || null,
    isFinal: extra.isFinal ?? true,
  };
}

function normalizeTranscript(text) {
  return typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';
}

function mergeTranscript(existingText, nextText) {
  const existing = normalizeTranscript(existingText);
  const next = normalizeTranscript(nextText);

  if (!existing) {
    return next;
  }

  if (!next) {
    return existing;
  }

  if (next === existing || next.startsWith(existing)) {
    return next;
  }

  if (existing.startsWith(next) || existing.endsWith(next)) {
    return existing;
  }

  return `${existing} ${next}`.replace(/\s+/g, ' ').trim();
}

function describeCaptureError(err) {
  if (err?.name === 'NotAllowedError') {
    return 'Microphone access was blocked. You can still use typed answers.';
  }

  if (err?.name === 'NotFoundError') {
    return 'No microphone was detected. You can still use typed answers.';
  }

  if (err?.name === 'NotReadableError') {
    return 'Your microphone is busy in another app. Close it or use typed answers.';
  }

  return 'Voice capture is unavailable right now. You can still use typed answers.';
}

function convertPcmChunkToFloat32(rawChunk) {
  const pcmBuffer = rawChunk instanceof ArrayBuffer ? rawChunk : rawChunk.buffer;
  const pcmView = new Int16Array(pcmBuffer);
  const float32 = new Float32Array(pcmView.length);

  for (let index = 0; index < pcmView.length; index += 1) {
    float32[index] = pcmView[index] / 0x8000;
  }

  return float32;
}

async function createCaptureGraph(stream, onAudioChunk) {
  const audioContext = new window.AudioContext();
  const workletModuleUrl = new URL('../workers/pcmCapture.worklet.js', import.meta.url);
  await audioContext.audioWorklet.addModule(workletModuleUrl.href);
  await audioContext.resume();

  const sourceNode = audioContext.createMediaStreamSource(stream);
  const processorNode = new AudioWorkletNode(audioContext, 'pcm-capture-processor', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
    channelCount: 1,
    channelCountMode: 'explicit',
    channelInterpretation: 'speakers',
    processorOptions: {
      targetSampleRate: INPUT_SAMPLE_RATE,
      chunkDurationMs: PCM_CAPTURE_CHUNK_MS,
    },
  });
  const muteNode = audioContext.createGain();
  muteNode.gain.value = 0;

  processorNode.port.onmessage = (event) => {
    if (event.data instanceof ArrayBuffer && event.data.byteLength > 0) {
      onAudioChunk(event.data);
    }
  };

  sourceNode.connect(processorNode);
  processorNode.connect(muteNode);
  muteNode.connect(audioContext.destination);

  return {
    audioContext,
    sourceNode,
    processorNode,
    muteNode,
    stream,
  };
}

export function useLiveVoiceInterview(
  scenario,
  {
    onFinalMessage,
    onFinalUtterance,
    onScenarioNotFound,
  } = {},
) {
  const [sessionId, setSessionId] = useState('');
  const [messages, setMessages] = useState([]);
  const [isReady, setIsReady] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [connectionState, setConnectionState] = useState('preparing');
  const [error, setError] = useState('');

  const socketRef = useRef(null);
  const sessionReadyRef = useRef(false);
  const messagesRef = useRef([]);
  const currentStreamingMessageIdRef = useRef(null);
  const finalizedMessageIdsRef = useRef(new Set());
  const pendingVoiceStartRef = useRef(false);
  const pendingTypedMessagesRef = useRef([]);
  const captureRequestIdRef = useRef(0);
  const captureRef = useRef(null);
  const playbackContextRef = useRef(null);
  const playbackGainNodeRef = useRef(null);
  const playbackNextTimeRef = useRef(0);
  const playbackSourcesRef = useRef(new Set());
  const sessionRunIdRef = useRef(0);
  const closedByClientRef = useRef(false);

  const onFinalMessageRef = useRef(onFinalMessage);
  const onFinalUtteranceRef = useRef(onFinalUtterance);
  const onScenarioNotFoundRef = useRef(onScenarioNotFound);

  useEffect(() => {
    onFinalMessageRef.current = onFinalMessage;
  }, [onFinalMessage]);

  useEffect(() => {
    onFinalUtteranceRef.current = onFinalUtterance;
  }, [onFinalUtterance]);

  useEffect(() => {
    onScenarioNotFoundRef.current = onScenarioNotFound;
  }, [onScenarioNotFound]);

  const commitMessages = useCallback((updater) => {
    const nextMessages = typeof updater === 'function' ? updater(messagesRef.current) : updater;
    messagesRef.current = nextMessages;
    setMessages(nextMessages);
    return nextMessages;
  }, []);

  const emitFinalMessage = useCallback((message) => {
    if (!message?.id || finalizedMessageIdsRef.current.has(message.id)) {
      return;
    }

    const normalizedContent = normalizeTranscript(message.content);
    if (!normalizedContent) {
      finalizedMessageIdsRef.current.add(message.id);
      return;
    }

    finalizedMessageIdsRef.current.add(message.id);
    const finalizedMessage = {
      id: message.id,
      role: message.role,
      content: normalizedContent,
      ts: message.ts,
      source: message.source || null,
    };

    onFinalMessageRef.current?.(finalizedMessage);
    if (finalizedMessage.role === 'user') {
      onFinalUtteranceRef.current?.({
        text: finalizedMessage.content,
        source: finalizedMessage.source || 'voice',
        ts: finalizedMessage.ts,
      });
    }
  }, []);

  const finalizeMessage = useCallback((messageId, { clearTranscript = false } = {}) => {
    if (!messageId) {
      return null;
    }

    let finalizedMessage = null;

    commitMessages((prevMessages) => prevMessages.map((message) => {
      if (message.id !== messageId) {
        return message;
      }

      const normalizedContent = normalizeTranscript(message.content);
      finalizedMessage = {
        ...message,
        content: normalizedContent,
        isFinal: true,
      };
      return finalizedMessage;
    }));

    if (currentStreamingMessageIdRef.current === messageId) {
      currentStreamingMessageIdRef.current = null;
    }

    if (clearTranscript) {
      setLiveTranscript('');
    }

    if (finalizedMessage) {
      emitFinalMessage(finalizedMessage);
    }

    return finalizedMessage;
  }, [commitMessages, emitFinalMessage]);

  const finalizeCurrentStreamingMessage = useCallback((role = null, options = {}) => {
    const currentMessageId = currentStreamingMessageIdRef.current;
    if (!currentMessageId) {
      return null;
    }

    const currentMessage = messagesRef.current.find((message) => message.id === currentMessageId);
    if (!currentMessage || currentMessage.isFinal) {
      currentStreamingMessageIdRef.current = null;
      return null;
    }

    if (role && currentMessage.role !== role) {
      return null;
    }

    return finalizeMessage(currentMessageId, options);
  }, [finalizeMessage]);

  const appendStreamingMessage = useCallback((role, content, extra = {}) => {
    const normalizedContent = normalizeTranscript(content);
    if (!normalizedContent) {
      return null;
    }

    let nextMessage = null;
    const currentMessageId = currentStreamingMessageIdRef.current;
    const currentMessage = currentMessageId
      ? messagesRef.current.find((message) => message.id === currentMessageId) || null
      : null;

    if (currentMessage && currentMessage.role !== role && !currentMessage.isFinal) {
      finalizeMessage(currentMessage.id, {
        clearTranscript: currentMessage.role === 'user',
      });
    }

    commitMessages((prevMessages) => {
      const latestMessages = [...prevMessages];
      const lastMessage = currentStreamingMessageIdRef.current
        ? latestMessages.find((message) => message.id === currentStreamingMessageIdRef.current) || null
        : null;

      if (lastMessage && lastMessage.role === role && !lastMessage.isFinal) {
        nextMessage = {
          ...lastMessage,
          content: mergeTranscript(lastMessage.content, normalizedContent),
        };
        const nextIndex = latestMessages.findIndex((message) => message.id === lastMessage.id);
        latestMessages[nextIndex] = nextMessage;
        return latestMessages;
      }

      nextMessage = createMessage(role, normalizedContent, {
        ts: extra.ts,
        source: extra.source || (role === 'user' ? 'voice' : null),
        isFinal: false,
      });
      latestMessages.push(nextMessage);
      currentStreamingMessageIdRef.current = nextMessage.id;
      return latestMessages;
    });

    if (nextMessage?.role === 'user') {
      setLiveTranscript(nextMessage.content);
    }

    return nextMessage;
  }, [commitMessages, finalizeMessage]);

  const appendFinalMessage = useCallback((role, content, extra = {}) => {
    const normalizedContent = normalizeTranscript(content);
    if (!normalizedContent) {
      return null;
    }

    finalizeCurrentStreamingMessage(null, { clearTranscript: role === 'user' });

    const nextMessage = createMessage(role, normalizedContent, {
      ts: extra.ts,
      source: extra.source || null,
      isFinal: true,
    });

    commitMessages((prevMessages) => [...prevMessages, nextMessage]);
    emitFinalMessage(nextMessage);
    if (role === 'user') {
      setLiveTranscript('');
    }

    return nextMessage;
  }, [commitMessages, emitFinalMessage, finalizeCurrentStreamingMessage]);

  const stopAssistantPlayback = useCallback(async ({ dispose = false } = {}) => {
    playbackSourcesRef.current.forEach((sourceNode) => {
      try {
        sourceNode.onended = null;
        sourceNode.stop();
      } catch (err) {
        console.error('Assistant source stop failed:', err);
      }

      try {
        sourceNode.disconnect();
      } catch (err) {
        console.error('Assistant source disconnect failed:', err);
      }
    });
    playbackSourcesRef.current.clear();
    playbackNextTimeRef.current = 0;
    setIsAgentSpeaking(false);

    if (dispose && playbackContextRef.current) {
      try {
        await playbackContextRef.current.close();
      } catch (err) {
        console.error('Assistant audio context close failed:', err);
      }

      playbackContextRef.current = null;
      playbackGainNodeRef.current = null;
    }
  }, []);

  const ensurePlaybackContext = useCallback(async () => {
    let playbackContext = playbackContextRef.current;

    if (!playbackContext || playbackContext.state === 'closed') {
      playbackContext = new window.AudioContext({ sampleRate: OUTPUT_SAMPLE_RATE });
      const gainNode = playbackContext.createGain();
      gainNode.connect(playbackContext.destination);
      playbackContextRef.current = playbackContext;
      playbackGainNodeRef.current = gainNode;
    }

    if (playbackContext.state === 'suspended') {
      try {
        await playbackContext.resume();
      } catch (err) {
        console.error('Assistant audio context resume failed:', err);
      }
    }

    return playbackContextRef.current;
  }, []);

  const playAssistantAudioChunk = useCallback(async (rawChunk) => {
    const playbackContext = await ensurePlaybackContext();
    if (!playbackContext || playbackContext.state === 'closed') {
      return;
    }

    const float32Audio = convertPcmChunkToFloat32(rawChunk);
    if (!float32Audio.length) {
      return;
    }

    const audioBuffer = playbackContext.createBuffer(1, float32Audio.length, OUTPUT_SAMPLE_RATE);
    audioBuffer.copyToChannel(float32Audio, 0);

    const sourceNode = playbackContext.createBufferSource();
    sourceNode.buffer = audioBuffer;
    sourceNode.connect(playbackGainNodeRef.current || playbackContext.destination);

    const startAt = Math.max(playbackContext.currentTime + 0.03, playbackNextTimeRef.current || 0);
    playbackNextTimeRef.current = startAt + audioBuffer.duration;
    playbackSourcesRef.current.add(sourceNode);
    setIsAgentSpeaking(true);

    sourceNode.onended = () => {
      playbackSourcesRef.current.delete(sourceNode);
      try {
        sourceNode.disconnect();
      } catch (err) {
        console.error('Assistant source cleanup failed:', err);
      }

      if (!playbackSourcesRef.current.size) {
        playbackNextTimeRef.current = 0;
        setIsAgentSpeaking(false);
      }
    };

    sourceNode.start(startAt);
  }, [ensurePlaybackContext]);

  const stopCapture = useCallback(async ({ clearTranscript = false } = {}) => {
    pendingVoiceStartRef.current = false;
    captureRequestIdRef.current += 1;

    const activeCapture = captureRef.current;
    captureRef.current = null;

    if (activeCapture?.processorNode) {
      activeCapture.processorNode.port.onmessage = null;
      try {
        activeCapture.processorNode.disconnect();
      } catch (err) {
        console.error('Capture processor disconnect failed:', err);
      }
    }

    if (activeCapture?.sourceNode) {
      try {
        activeCapture.sourceNode.disconnect();
      } catch (err) {
        console.error('Capture source disconnect failed:', err);
      }
    }

    if (activeCapture?.muteNode) {
      try {
        activeCapture.muteNode.disconnect();
      } catch (err) {
        console.error('Capture mute node disconnect failed:', err);
      }
    }

    activeCapture?.stream?.getTracks().forEach((track) => track.stop());

    if (activeCapture?.audioContext) {
      try {
        await activeCapture.audioContext.close();
      } catch (err) {
        console.error('Capture audio context close failed:', err);
      }
    }

    setIsListening(false);
    if (clearTranscript) {
      setLiveTranscript('');
    }

    setConnectionState((currentState) => {
      if (!sessionReadyRef.current) {
        return currentState === 'error' ? 'error' : 'preparing';
      }

      return currentState === 'error' ? 'error' : 'idle';
    });
  }, []);

  const flushPendingTypedMessages = useCallback(() => {
    if (!sessionReadyRef.current || !socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    const queuedMessages = pendingTypedMessagesRef.current;
    pendingTypedMessagesRef.current = [];
    queuedMessages.forEach((content) => {
      socketRef.current.send(JSON.stringify({
        type: 'InjectUserMessage',
        content,
      }));
    });
  }, []);

  const startCapture = useCallback(async () => {
    if (captureRef.current || !sessionReadyRef.current) {
      return;
    }

    const requestId = captureRequestIdRef.current + 1;
    captureRequestIdRef.current = requestId;
    pendingVoiceStartRef.current = false;
    setError('');
    setConnectionState('requesting-mic');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      if (captureRequestIdRef.current !== requestId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const nextCapture = await createCaptureGraph(stream, (audioChunk) => {
        const liveSocket = socketRef.current;
        if (
          sessionReadyRef.current
          && liveSocket
          && liveSocket.readyState === WebSocket.OPEN
          && audioChunk instanceof ArrayBuffer
          && audioChunk.byteLength > 0
        ) {
          liveSocket.send(audioChunk);
        }
      });

      if (captureRequestIdRef.current !== requestId) {
        nextCapture.stream.getTracks().forEach((track) => track.stop());
        await nextCapture.audioContext.close();
        return;
      }

      captureRef.current = nextCapture;
      setIsListening(true);
      setConnectionState('listening');
    } catch (err) {
      console.error('Voice capture start failed:', err);
      setError(describeCaptureError(err));
      setConnectionState(sessionReadyRef.current ? 'idle' : 'preparing');
      setIsListening(false);
    }
  }, []);

  const initializeLiveSession = useCallback(() => {
    const runId = sessionRunIdRef.current + 1;
    sessionRunIdRef.current = runId;
    closedByClientRef.current = false;
    sessionReadyRef.current = false;
    setSessionId('');
    setIsReady(false);
    setIsThinking(false);
    setIsAgentSpeaking(false);
    setIsListening(false);
    setLiveTranscript('');
    setError('');
    setConnectionState('preparing');
    pendingTypedMessagesRef.current = [];
    pendingVoiceStartRef.current = false;
    finalizedMessageIdsRef.current = new Set();
    currentStreamingMessageIdRef.current = null;
    commitMessages([]);
    stopAssistantPlayback({ dispose: true });

    const liveSocket = new WebSocket(LIVE_INTERVIEW_WS_URL);
    liveSocket.binaryType = 'arraybuffer';
    socketRef.current = liveSocket;

    liveSocket.onopen = () => {
      if (sessionRunIdRef.current !== runId) {
        liveSocket.close();
        return;
      }

      liveSocket.send(JSON.stringify({
        type: 'StartSession',
        scenarioId: scenario.id,
      }));
    };

    liveSocket.onmessage = async (event) => {
      if (sessionRunIdRef.current !== runId) {
        return;
      }

      if (event.data instanceof ArrayBuffer) {
        await playAssistantAudioChunk(event.data);
        return;
      }

      let payload = null;
      try {
        payload = JSON.parse(event.data);
      } catch (err) {
        console.error('Failed to parse live interview payload:', err);
        return;
      }

      if (payload.type === 'SessionReady') {
        sessionReadyRef.current = true;
        setSessionId(payload.sessionId || '');
        setIsReady(true);
        setError('');
        setConnectionState((currentState) => (
          currentState === 'requesting-mic' || currentState === 'listening'
            ? currentState
            : 'idle'
        ));
        flushPendingTypedMessages();
        if (pendingVoiceStartRef.current) {
          startCapture();
        }
        return;
      }

      if (payload.type === 'ConversationText') {
        appendStreamingMessage(payload.role, payload.content, {
          source: payload.role === 'user' ? 'voice' : null,
          ts: Date.now(),
        });
        return;
      }

      if (payload.type === 'UserStartedSpeaking') {
        await stopAssistantPlayback();
        finalizeCurrentStreamingMessage('assistant');
        setIsThinking(false);
        setIsAgentSpeaking(false);
        return;
      }

      if (payload.type === 'AgentThinking') {
        await stopCapture();
        finalizeCurrentStreamingMessage('user', { clearTranscript: true });
        setIsThinking(true);
        setIsAgentSpeaking(false);
        return;
      }

      if (payload.type === 'AgentStartedSpeaking') {
        await stopCapture();
        setIsThinking(false);
        setIsAgentSpeaking(true);
        return;
      }

      if (payload.type === 'AgentAudioDone') {
        finalizeCurrentStreamingMessage('assistant');
        setIsThinking(false);
        setIsAgentSpeaking(false);
        return;
      }

      if (payload.type === 'InjectionRefused') {
        setIsThinking(false);
        setError('The interviewer was still responding. Wait a beat, then try again.');
        return;
      }

      if (payload.type === 'Warning') {
        console.warn('Live interview warning:', payload);
        return;
      }

      if (payload.type === 'Error') {
        const errorCode = typeof payload.code === 'string' ? payload.code : '';
        const errorMessage = typeof payload.message === 'string'
          ? payload.message
          : 'The live interviewer is unavailable right now.';

        console.error('Live interview error:', errorMessage || payload.description || payload);
        sessionReadyRef.current = false;
        setIsReady(false);
        setError(errorMessage);
        setConnectionState('error');
        setIsThinking(false);
        setIsAgentSpeaking(false);
        await stopCapture();

        if (errorCode === 'SCENARIO_NOT_FOUND') {
          onScenarioNotFoundRef.current?.({
            scenarioId: typeof payload.scenarioId === 'string' ? payload.scenarioId : scenario.id,
            message: errorMessage,
          });
        }
      }
    };

    liveSocket.onerror = () => {
      if (sessionRunIdRef.current !== runId) {
        return;
      }

      setError('The live interviewer could not connect. Reload and try again.');
      setConnectionState('error');
      setIsReady(false);
    };

    liveSocket.onclose = () => {
      if (sessionRunIdRef.current !== runId || closedByClientRef.current) {
        return;
      }

      sessionReadyRef.current = false;
      setIsReady(false);
      setConnectionState('error');
      setIsThinking(false);
      setIsAgentSpeaking(false);
      setError('The live interviewer disconnected. Reload and try again.');
    };
  }, [
    appendStreamingMessage,
    commitMessages,
    finalizeCurrentStreamingMessage,
    flushPendingTypedMessages,
    playAssistantAudioChunk,
    scenario.id,
    startCapture,
    stopAssistantPlayback,
    stopCapture,
  ]);

  useEffect(() => {
    const initTimeoutId = window.setTimeout(() => {
      initializeLiveSession();
    }, 0);

    return () => {
      window.clearTimeout(initTimeoutId);
      closedByClientRef.current = true;
      sessionRunIdRef.current += 1;
      pendingVoiceStartRef.current = false;
      pendingTypedMessagesRef.current = [];
      sessionReadyRef.current = false;

      const liveSocket = socketRef.current;
      socketRef.current = null;
      if (liveSocket && (liveSocket.readyState === WebSocket.OPEN || liveSocket.readyState === WebSocket.CONNECTING)) {
        try {
          if (liveSocket.readyState === WebSocket.OPEN) {
            liveSocket.send(JSON.stringify({ type: 'FinishSession' }));
          }
          liveSocket.close(1000, 'component_unmounted');
        } catch (err) {
          console.error('Live interview socket close failed:', err);
        }
      }

      stopCapture();
      stopAssistantPlayback({ dispose: true });
    };
  }, [initializeLiveSession, stopAssistantPlayback, stopCapture]);

  useEffect(() => {
    const handlePointerDown = () => {
      ensurePlaybackContext();
    };

    window.addEventListener('pointerdown', handlePointerDown, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [ensurePlaybackContext]);

  const startListening = useCallback(() => {
    setError('');
    pendingVoiceStartRef.current = true;
    stopAssistantPlayback();
    finalizeCurrentStreamingMessage('assistant');

    if (!sessionReadyRef.current) {
      setConnectionState('preparing');
      return;
    }

    startCapture();
  }, [finalizeCurrentStreamingMessage, startCapture, stopAssistantPlayback]);

  const stopListening = useCallback(() => {
    stopCapture();
  }, [stopCapture]);

  const sendTextMessage = useCallback((text) => {
    const normalizedContent = normalizeTranscript(text);
    if (!normalizedContent) {
      return false;
    }

    setError('');
    stopAssistantPlayback();
    finalizeCurrentStreamingMessage('assistant');
    appendFinalMessage('user', normalizedContent, {
      source: 'typed',
      ts: Date.now(),
    });
    setIsThinking(true);
    setIsAgentSpeaking(false);

    if (sessionReadyRef.current && socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'InjectUserMessage',
        content: normalizedContent,
      }));
      return true;
    }

    pendingTypedMessagesRef.current.push(normalizedContent);
    setConnectionState('preparing');
    return true;
  }, [appendFinalMessage, finalizeCurrentStreamingMessage, stopAssistantPlayback]);

  const finishSession = useCallback(() => {
    closedByClientRef.current = true;
    pendingVoiceStartRef.current = false;
    pendingTypedMessagesRef.current = [];
    sessionReadyRef.current = false;
    setIsReady(false);
    setIsThinking(false);
    setIsAgentSpeaking(false);
    setConnectionState('idle');

    const liveSocket = socketRef.current;
    socketRef.current = null;
    if (liveSocket && (liveSocket.readyState === WebSocket.OPEN || liveSocket.readyState === WebSocket.CONNECTING)) {
      try {
        if (liveSocket.readyState === WebSocket.OPEN) {
          liveSocket.send(JSON.stringify({ type: 'FinishSession' }));
        }
        liveSocket.close(1000, 'session_finished');
      } catch (err) {
        console.error('Live interview finish close failed:', err);
      }
    }

    stopCapture({ clearTranscript: true });
    stopAssistantPlayback({ dispose: true });
  }, [stopAssistantPlayback, stopCapture]);

  return {
    sessionId,
    messages,
    isReady,
    isThinking,
    isListening,
    isAgentSpeaking,
    liveTranscript,
    connectionState,
    error,
    startListening,
    stopListening,
    sendTextMessage,
    finishSession,
  };
}
