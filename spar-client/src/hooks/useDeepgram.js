import { useState, useRef, useCallback } from 'react';

export function useDeepgram({ onFinalTranscript }) {
  const [isListening, setIsListening] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const socketRef = useRef(null);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);

  const startListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const socket = new WebSocket('ws://localhost:3001/deepgram');
      socketRef.current = socket;

      socket.onopen = () => {
        const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        recorderRef.current = recorder;

        recorder.ondataavailable = (e) => {
          if (socket.readyState === WebSocket.OPEN && e.data.size > 0) {
            socket.send(e.data);
          }
        };

        recorder.start(250);
        setIsListening(true);
      };

      socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        const transcript = data.channel?.alternatives?.[0]?.transcript;
        const isFinal = data.is_final;

        if (transcript) {
          setLiveTranscript(transcript);
          if (isFinal && transcript.trim().length > 0) {
            onFinalTranscript(transcript); // fires Person B's sendMessage
            setLiveTranscript('');
          }
        }
      };

      socket.onerror = (err) => console.error('WebSocket error:', err);

    } catch (err) {
      console.error('Mic access denied:', err);
      alert('Please allow microphone access to use Spar.');
    }
  }, [onFinalTranscript]);

  const stopListening = useCallback(() => {
    recorderRef.current?.stop();
    socketRef.current?.close();
    streamRef.current?.getTracks().forEach(t => t.stop());
    setIsListening(false);
    setLiveTranscript('');
  }, []);

  return { isListening, liveTranscript, startListening, stopListening };
}
