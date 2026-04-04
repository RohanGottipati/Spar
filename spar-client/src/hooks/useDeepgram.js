import { useCallback, useEffect, useRef, useState } from 'react';
import { buildWebSocketUrl } from '../lib/api';

const DEEPGRAM_WS_URL = buildWebSocketUrl('/deepgram');
const RECORDER_TIMESLICE_MS = 250;
const FINAL_TRANSCRIPT_GRACE_MS = 1200;

function getRecorderOptions() {
  if (typeof MediaRecorder === 'undefined') {
    return undefined;
  }

  const preferredMimeTypes = [
    'audio/webm;codecs=opus',
    'audio/webm',
  ];

  const supportedMimeType = preferredMimeTypes.find((mimeType) => (
    typeof MediaRecorder.isTypeSupported === 'function'
      ? MediaRecorder.isTypeSupported(mimeType)
      : false
  ));

  return supportedMimeType ? { mimeType: supportedMimeType } : undefined;
}

function describeVoiceError(err) {
  if (err?.name === 'NotAllowedError') {
    return 'Microphone access was blocked. Use the text fallback or allow mic access in Chrome.';
  }

  if (err?.name === 'NotFoundError') {
    return 'No microphone was detected. Use the text fallback.';
  }

  if (err?.name === 'NotReadableError') {
    return 'Your microphone is busy in another app. Close it or use the text fallback.';
  }

  return 'Voice is unavailable right now. Use the text fallback.';
}

async function readSocketMessageData(rawData) {
  if (typeof rawData === 'string') {
    return rawData;
  }

  if (rawData instanceof Blob) {
    return rawData.text();
  }

  if (rawData instanceof ArrayBuffer) {
    return new TextDecoder().decode(rawData);
  }

  if (ArrayBuffer.isView(rawData)) {
    return new TextDecoder().decode(rawData);
  }

  return String(rawData);
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

export function useDeepgram({ onFinalTranscript }) {
  const [isListening, setIsListening] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [connectionState, setConnectionState] = useState('idle');
  const [error, setError] = useState('');
  const socketRef = useRef(null);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const sessionIdRef = useRef(0);
  const pendingTranscriptRef = useRef('');
  const finalizeTimerRef = useRef(null);

  const clearFinalizeTimer = useCallback(() => {
    if (finalizeTimerRef.current) {
      window.clearTimeout(finalizeTimerRef.current);
      finalizeTimerRef.current = null;
    }
  }, []);

  const teardownResources = useCallback(() => {
    clearFinalizeTimer();

    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch (err) {
        console.error('Recorder stop failed:', err);
      }
    }

    const socket = socketRef.current;
    socketRef.current = null;
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      try {
        socket.close();
      } catch (err) {
        console.error('Socket close failed:', err);
      }
    }

    const stream = streamRef.current;
    streamRef.current = null;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
  }, [clearFinalizeTimer]);

  const stopListening = useCallback(({ submitPending = false } = {}) => {
    const finalTranscript = submitPending ? normalizeTranscript(pendingTranscriptRef.current) : '';
    sessionIdRef.current += 1;
    pendingTranscriptRef.current = '';
    teardownResources();
    setIsListening(false);
    setLiveTranscript('');
    setConnectionState('idle');
    setError('');
    if (submitPending && finalTranscript) {
      onFinalTranscript(finalTranscript);
    }
  }, [onFinalTranscript, teardownResources]);

  const failSession = useCallback((message) => {
    sessionIdRef.current += 1;
    pendingTranscriptRef.current = '';
    teardownResources();
    setIsListening(false);
    setLiveTranscript('');
    setConnectionState('error');
    setError(message);
  }, [teardownResources]);

  const startListening = useCallback(async () => {
    if (socketRef.current || recorderRef.current || connectionState === 'requesting' || connectionState === 'connecting') {
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof WebSocket === 'undefined' || typeof MediaRecorder === 'undefined') {
      failSession('This browser cannot capture audio here. Use the text fallback.');
      return;
    }

    setError('');
    setLiveTranscript('');
    pendingTranscriptRef.current = '';
    clearFinalizeTimer();
    setConnectionState('requesting');
    const sessionId = sessionIdRef.current + 1;
    sessionIdRef.current = sessionId;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (sessionIdRef.current !== sessionId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      setConnectionState('connecting');

      const socket = new WebSocket(DEEPGRAM_WS_URL);
      socketRef.current = socket;

      socket.onopen = () => {
        if (sessionIdRef.current !== sessionId) {
          try {
            socket.close();
          } catch (err) {
            console.error('Socket close failed:', err);
          }
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        try {
          const recorder = new MediaRecorder(stream, getRecorderOptions());
          recorderRef.current = recorder;

          recorder.ondataavailable = (event) => {
            if (sessionIdRef.current !== sessionId) {
              return;
            }

            if (socket.readyState === WebSocket.OPEN && event.data.size > 0) {
              socket.send(event.data);
            }
          };

          recorder.start(RECORDER_TIMESLICE_MS);
          setIsListening(true);
          setConnectionState('listening');
        } catch (err) {
          console.error('Recorder setup failed:', err);
          failSession('Audio capture could not start. Use the text fallback.');
        }
      };

      socket.onmessage = async (event) => {
        if (sessionIdRef.current !== sessionId) {
          return;
        }

        let data;
        try {
          const messageText = await readSocketMessageData(event.data);
          data = JSON.parse(messageText);
        } catch (err) {
          console.error('Failed to parse Deepgram payload:', err);
          return;
        }

        if (data?.type === 'error') {
          failSession(typeof data.message === 'string' ? data.message : 'Voice is unavailable right now. Use the text fallback.');
          return;
        }

        if (data?.type === 'UtteranceEnd') {
          if (pendingTranscriptRef.current) {
            clearFinalizeTimer();
            finalizeTimerRef.current = window.setTimeout(() => {
              if (sessionIdRef.current === sessionId) {
                stopListening({ submitPending: true });
              }
            }, FINAL_TRANSCRIPT_GRACE_MS);
          }

          return;
        }

        const transcript = data.channel?.alternatives?.[0]?.transcript;
        const isFinal = data.is_final;
        const normalizedTranscript = normalizeTranscript(transcript);

        if (normalizedTranscript) {
          if (isFinal) {
            pendingTranscriptRef.current = mergeTranscript(pendingTranscriptRef.current, normalizedTranscript);
            setLiveTranscript(pendingTranscriptRef.current);
          } else {
            setLiveTranscript(mergeTranscript(pendingTranscriptRef.current, normalizedTranscript));
          }

          clearFinalizeTimer();
          finalizeTimerRef.current = window.setTimeout(() => {
            if (sessionIdRef.current === sessionId) {
              stopListening({ submitPending: true });
            }
          }, FINAL_TRANSCRIPT_GRACE_MS);
        }
      };

      socket.onerror = (err) => {
        if (sessionIdRef.current !== sessionId) {
          return;
        }

        console.error('WebSocket error:', err);
        failSession('Voice connection failed. Use the text fallback.');
      };

      socket.onclose = () => {
        if (sessionIdRef.current !== sessionId) {
          return;
        }

        stopListening();
      };
    } catch (err) {
      console.error('Mic access denied:', err);
      failSession(describeVoiceError(err));
    }
  }, [clearFinalizeTimer, connectionState, failSession, stopListening]);

  useEffect(() => () => {
    teardownResources();
  }, [teardownResources]);

  return {
    isListening,
    liveTranscript,
    connectionState,
    error,
    startListening,
    stopListening,
  };
}
