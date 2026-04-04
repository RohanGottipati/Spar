import { useState } from 'react';

export default function VoiceBar({
  liveTranscript,
  isListening,
  isThinking = false,
  isAgentSpeaking = false,
  connectionState = 'idle',
  errorMessage = '',
  sessionReady = false,
  disabled = false,
  disableFinish = false,
  onStart,
  onStop,
  onFinish,
  onSubmitText,
}) {
  const [typedInput, setTypedInput] = useState('');
  const voiceButtonDisabled = disabled || connectionState === 'error';
  const canSendTypedMessage = typedInput.trim().length > 0
    && sessionReady
    && !isThinking
    && !isAgentSpeaking
    && !disabled
    && connectionState !== 'error';

  const handleTypedSubmit = (event) => {
    event.preventDefault();
    const trimmedInput = typedInput.trim();
    if (!trimmedInput || !canSendTypedMessage) {
      return;
    }

    onSubmitText?.(trimmedInput);
    setTypedInput('');
  };

  let statusText = 'Use your mic, or type if voice fails.';
  let statusColor = '#555';

  if (errorMessage) {
    statusText = errorMessage;
    statusColor = '#ff8c6b';
  } else if (isAgentSpeaking) {
    statusText = 'Interviewer is speaking...';
    statusColor = '#5b9cf6';
  } else if (isThinking) {
    statusText = 'Interviewer is working through your answer...';
    statusColor = '#5b9cf6';
  } else if (connectionState === 'preparing') {
    statusText = 'Connecting interviewer...';
    statusColor = '#f5a623';
  } else if (connectionState === 'requesting-mic') {
    statusText = 'Requesting microphone access...';
    statusColor = '#f5a623';
  } else if (isListening) {
    statusText = 'Listening. Think out loud naturally.';
    statusColor = '#3ddc84';
  } else if (sessionReady) {
    statusText = 'Start talking, or type if you prefer.';
    statusColor = '#666';
  }

  return (
    <div style={{ padding: 16, borderTop: '1px solid #222', background: '#111' }}>
      {liveTranscript && (
        <div style={{
          marginBottom: 12,
          padding: '8px 14px',
          background: '#1a1a22',
          borderRadius: 8,
          fontSize: 13,
          color: '#888',
          fontStyle: 'italic',
          border: '1px solid #2a2a35',
        }}>
          "{liveTranscript}"
        </div>
      )}

      <div style={{ marginBottom: 12, fontSize: 12, color: '#666', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        Voice Or Text
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        <button
          onClick={isListening ? onStop : onStart}
          disabled={voiceButtonDisabled}
          style={{
            flex: 1,
            padding: '12px 0',
            background: isListening ? '#3ddc84' : '#ff5c35',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontWeight: 700,
            fontSize: 14,
            cursor: voiceButtonDisabled ? 'not-allowed' : 'pointer',
            transition: 'background 0.15s',
            opacity: voiceButtonDisabled ? 0.6 : 1,
          }}
        >
          {isListening ? 'Stop talking' : 'Start talking'}
        </button>

        <button
          onClick={onFinish}
          disabled={disableFinish}
          style={{
            padding: '12px 20px',
            background: 'transparent',
            color: '#555',
            border: '1px solid #333',
            borderRadius: 8,
            fontSize: 14,
            cursor: disableFinish ? 'not-allowed' : 'pointer',
            fontFamily: 'sans-serif',
            opacity: disableFinish ? 0.6 : 1,
          }}
        >
          I'm done
        </button>
      </div>

      <form onSubmit={handleTypedSubmit} style={{ display: 'flex', gap: 10 }}>
        <input
          type="text"
          value={typedInput}
          onChange={(event) => setTypedInput(event.target.value)}
          disabled={disabled || !sessionReady || connectionState === 'error'}
          placeholder="Text fallback if the mic fails..."
          style={{
            flex: 1,
            padding: '12px 14px',
            background: '#0a0a0b',
            color: '#f0f0f0',
            border: '1px solid #2a2a35',
            borderRadius: 8,
            fontSize: 14,
            outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={!canSendTypedMessage}
          style={{
            padding: '12px 16px',
            background: canSendTypedMessage ? '#1e1e26' : 'transparent',
            color: canSendTypedMessage ? '#f0f0f0' : '#555',
            border: '1px solid #333',
            borderRadius: 8,
            fontSize: 14,
            cursor: canSendTypedMessage ? 'pointer' : 'not-allowed',
          }}
        >
          Send
        </button>
      </form>

      <div style={{ marginTop: 10, fontSize: 12, color: statusColor, textAlign: 'center' }}>
        {statusText}
      </div>
    </div>
  );
}
