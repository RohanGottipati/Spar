import { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { useDeepgram } from '../hooks/useDeepgram';
import { useInterviewer } from '../hooks/useInterviewer';
import VoiceBar from '../components/VoiceBar';
import Timer from '../components/Timer';

export default function Interview({ scenario, onFinish }) {
  const [sessionStartTime] = useState(() => Date.now());
  const [activeFile, setActiveFile] = useState(Object.keys(scenario.files)[0]);
  const [fileContents, setFileContents] = useState({ ...scenario.files });
  const chatEndRef = useRef(null);

  // Behavior tracking for the report card
  const behaviorRef = useRef({
    readBeforeEdit: false,
    firstEditTime: null,
    startTime: sessionStartTime,
    utteranceCount: 0,
    aiMessagesReceived: 0,
    filesViewed: new Set(),
  });

  const { messages, isThinking, sendMessage } = useInterviewer(scenario);

  const handleFinalTranscript = (transcript) => {
    behaviorRef.current.utteranceCount++;
    sendMessage(transcript);
  };

  const { isListening, liveTranscript, startListening, stopListening } = useDeepgram({
    onFinalTranscript: handleFinalTranscript
  });

  const handleFileSelect = (filename) => {
    setActiveFile(filename);
    behaviorRef.current.filesViewed.add(filename);
    if (!behaviorRef.current.firstEditTime) behaviorRef.current.readBeforeEdit = true;
  };

  const handleEditorChange = (value) => {
    if (!behaviorRef.current.firstEditTime) behaviorRef.current.firstEditTime = Date.now();
    setFileContents(prev => ({ ...prev, [activeFile]: value }));
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    behaviorRef.current.aiMessagesReceived = messages.filter(m => m.role === 'assistant').length;
  }, [messages]);

  const handleFinish = () => {
    const b = behaviorRef.current;
    onFinish({
      duration: Math.floor((Date.now() - b.startTime) / 1000),
      readBeforeEdit: b.readBeforeEdit,
      filesViewed: b.filesViewed.size,
      utteranceCount: b.utteranceCount,
      aiMessagesReceived: b.aiMessagesReceived,
      timeToFirstEdit: b.firstEditTime ? Math.floor((b.firstEditTime - b.startTime) / 1000) : null,
      conversationHistory: messages,
    });
  };

  const visibleFiles = Object.keys(scenario.files).filter(f => !f.includes('.fixed.'));

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0a0a0b', color: '#f0f0f0', fontFamily: 'sans-serif' }}>

      {/* LEFT: Code Editor */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid #222' }}>

        <div style={{ display: 'flex', background: '#111', borderBottom: '1px solid #222', overflowX: 'auto' }}>
          {visibleFiles.map(filename => (
            <button key={filename} onClick={() => handleFileSelect(filename)} style={{
              padding: '10px 20px', border: 'none', cursor: 'pointer',
              background: activeFile === filename ? '#1e1e1e' : 'transparent',
              color: activeFile === filename ? '#fff' : '#666',
              fontFamily: 'monospace', fontSize: 13,
              borderBottom: activeFile === filename ? '2px solid #ff5c35' : '2px solid transparent',
              whiteSpace: 'nowrap',
            }}>
              {filename.split('/').pop()}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }}>
          <Editor
            height="100%"
            language="javascript"
            theme="vs-dark"
            value={fileContents[activeFile]}
            onChange={handleEditorChange}
            options={{
              fontSize: 14,
              minimap: { enabled: false },
              lineNumbers: 'on',
              wordWrap: 'on',
              scrollBeyondLastLine: false,
              padding: { top: 16 }
            }}
          />
        </div>
      </div>

      {/* RIGHT: Interviewer panel */}
      <div style={{ width: 380, display: 'flex', flexDirection: 'column', background: '#111' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #222', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#ff5c35', letterSpacing: '0.1em' }}>SPAR</div>
            <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>{scenario.title}</div>
          </div>
          <Timer seconds={scenario.timeLimit} onExpire={handleFinish} />
        </div>

        {/* Chat messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {messages.map((msg, i) => (
            <div key={i} style={{
              alignSelf: msg.role === 'assistant' ? 'flex-start' : 'flex-end',
              maxWidth: '85%', padding: '10px 14px',
              borderRadius: msg.role === 'assistant' ? '4px 12px 12px 12px' : '12px 4px 12px 12px',
              background: msg.role === 'assistant' ? '#1e1e26' : '#ff5c35',
              color: '#f0f0f0', fontSize: 14, lineHeight: 1.5,
            }}>
              {msg.content}
            </div>
          ))}
          {isThinking && (
            <div style={{ alignSelf: 'flex-start', color: '#555', fontSize: 13, fontStyle: 'italic' }}>
              thinking...
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Voice bar */}
        <VoiceBar
          liveTranscript={liveTranscript}
          isListening={isListening}
          onStart={startListening}
          onStop={stopListening}
          onFinish={handleFinish}
        />
      </div>
    </div>
  );
}
