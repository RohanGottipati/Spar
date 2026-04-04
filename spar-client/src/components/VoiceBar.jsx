export default function VoiceBar({ liveTranscript, isListening, onStart, onStop, onFinish }) {
  return (
    <div style={{ padding: 16, borderTop: '1px solid #222', background: '#111' }}>

      {liveTranscript && (
        <div style={{
          marginBottom: 12, padding: '8px 14px',
          background: '#1a1a22', borderRadius: 8,
          fontSize: 13, color: '#888', fontStyle: 'italic',
          border: '1px solid #2a2a35'
        }}>
          "{liveTranscript}"
        </div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={isListening ? onStop : onStart}
          style={{
            flex: 1, padding: '12px 0',
            background: isListening ? '#3ddc84' : '#ff5c35',
            color: '#fff', border: 'none', borderRadius: 8,
            fontWeight: 700, fontSize: 14, cursor: 'pointer',
            transition: 'background 0.15s',
          }}
        >
          {isListening ? '⏹ Stop talking' : '🎙 Start talking'}
        </button>

        <button
          onClick={onFinish}
          style={{
            padding: '12px 20px', background: 'transparent',
            color: '#555', border: '1px solid #333', borderRadius: 8,
            fontSize: 14, cursor: 'pointer', fontFamily: 'sans-serif'
          }}
        >
          I'm done
        </button>
      </div>

      <div style={{ marginTop: 10, fontSize: 12, color: isListening ? '#3ddc84' : '#333', textAlign: 'center' }}>
        {isListening ? '● Recording — speak naturally' : 'Press the button and think out loud'}
      </div>
    </div>
  );
}
