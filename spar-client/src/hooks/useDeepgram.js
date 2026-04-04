import { useCallback, useEffect, useRef, useState } from 'react';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const DEEPGRAM_WS_URL = `${API_BASE_URL.replace(/^http/i, 'ws')}/deepgram`;
const RECORDER_TIMESLICE_MS = 250;

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

export function useDeepgram({ onFinalTranscript }) {
  const [isListening, setIsListening] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [connectionState, setConnectionState] = useState('idle');
  const [error, setError] = useState('');
  const socketRef = useRef(null);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const sessionIdRef = useRef(0);

  const teardownResources = useCallback(() => {
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
  }, []);

  const stopListening = useCallback(() => {
    sessionIdRef.current += 1;
    teardownResources();
    setIsListening(false);
    setLiveTranscript('');
    setConnectionState('idle');
    setError('');
  }, [teardownResources]);

  const failSession = useCallback((message) => {
    sessionIdRef.current += 1;
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

      socket.onmessage = (event) => {
        if (sessionIdRef.current !== sessionId) {
          return;
        }

        let data;
        try {
          data = JSON.parse(event.data);
        } catch (err) {
          console.error('Failed to parse Deepgram payload:', err);
          return;
        }

        if (data?.type === 'error') {
          failSession(typeof data.message === 'string' ? data.message : 'Voice is unavailable right now. Use the text fallback.');
          return;
        }

        const transcript = data.channel?.alternatives?.[0]?.transcript;
        const isFinal = data.is_final;

        if (transcript) {
          setLiveTranscript(transcript);
          if (isFinal && transcript.trim().length > 0) {
            onFinalTranscript(transcript);
            setLiveTranscript('');
          }
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
  }, [connectionState, failSession, onFinalTranscript, stopListening]);

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
