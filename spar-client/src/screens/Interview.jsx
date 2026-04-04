import { Component, useCallback, useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { useDeepgram } from '../hooks/useDeepgram';
import { useInterviewer } from '../hooks/useInterviewer';
import VoiceBar from '../components/VoiceBar';
import Timer from '../components/Timer';

class MonacoErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error('Monaco failed to render:', error);
    this.props.onError();
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }

    return this.props.children;
  }
}

function MonacoLoadingFallback({ onTimeout }) {
  useEffect(() => {
    const timeoutId = window.setTimeout(onTimeout, 3500);
    return () => window.clearTimeout(timeoutId);
  }, [onTimeout]);

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#666',
      fontSize: 14,
      background: '#111',
    }}>
      Loading editor...
    </div>
  );
}

export default function Interview({ scenario, onFinish }) {
  const [sessionStartTime] = useState(() => Date.now());
  const [activeFile, setActiveFile] = useState(Object.keys(scenario.files)[0]);
  const [fileContents, setFileContents] = useState({ ...scenario.files });
  const [usePlainEditor, setUsePlainEditor] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const [chatWidth, setChatWidth] = useState(380);
  const chatEndRef = useRef(null);
  const dragRef = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(380);

  const onDragStart = useCallback((e) => {
    dragRef.current = true;
    dragStartX.current = e.clientX;
    dragStartWidth.current = chatWidth;

    const onMove = (e) => {
      if (!dragRef.current) return;
      const delta = dragStartX.current - e.clientX;
      setChatWidth(Math.min(600, Math.max(240, dragStartWidth.current + delta)));
    };
    const onUp = () => {
      dragRef.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [chatWidth]);

  const behaviorRef = useRef({
    readBeforeEdit: false,
    firstEditTime: null,
    startTime: sessionStartTime,
    utteranceCount: 0,
    aiMessagesReceived: 0,
    filesViewed: new Set(),
  });

  const { messages, isThinking, sendMessage } = useInterviewer(scenario);

  const submitCandidateMessage = useCallback((text) => {
    const trimmedText = typeof text === 'string' ? text.trim() : '';
    if (!trimmedText) {
      return;
    }

    behaviorRef.current.utteranceCount++;
    sendMessage(trimmedText);
  }, [sendMessage]);

  const {
    isListening,
    liveTranscript,
    connectionState,
    error,
    startListening,
    stopListening,
  } = useDeepgram({
    onFinalTranscript: submitCandidateMessage,
  });

  const handleFileSelect = (filename) => {
    setActiveFile(filename);
    behaviorRef.current.filesViewed.add(filename);
    if (!behaviorRef.current.firstEditTime) {
      behaviorRef.current.readBeforeEdit = true;
    }
  };

  const handleEditorChange = (value) => {
    if (!behaviorRef.current.firstEditTime) {
      behaviorRef.current.firstEditTime = Date.now();
    }

    setFileContents((prev) => ({ ...prev, [activeFile]: value ?? '' }));
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    behaviorRef.current.aiMessagesReceived = messages.filter((message) => message.role === 'assistant').length;
  }, [messages]);

  useEffect(() => () => {
    stopListening();
  }, [stopListening]);

  const handleTypedSubmit = useCallback((text) => {
    if (isListening) {
      stopListening();
    }

    submitCandidateMessage(text);
  }, [isListening, stopListening, submitCandidateMessage]);

  const handleFinish = useCallback(() => {
    stopListening();
    const behavior = behaviorRef.current;
    onFinish({
      duration: Math.floor((Date.now() - behavior.startTime) / 1000),
      readBeforeEdit: behavior.readBeforeEdit,
      filesViewed: behavior.filesViewed.size,
      utteranceCount: behavior.utteranceCount,
      aiMessagesReceived: behavior.aiMessagesReceived,
      timeToFirstEdit: behavior.firstEditTime
        ? Math.floor((behavior.firstEditTime - behavior.startTime) / 1000)
        : null,
      conversationHistory: messages,
    });
  }, [messages, onFinish, stopListening]);

  const visibleFiles = Object.keys(scenario.files).filter((filename) => !filename.includes('.fixed.'));
  const simpleEditor = (
    <textarea
      value={fileContents[activeFile]}
      onChange={(event) => handleEditorChange(event.target.value)}
      spellCheck={false}
      style={{
        width: '100%',
        height: '100%',
        padding: 16,
        border: 'none',
        background: '#111',
        color: '#f0f0f0',
        fontFamily: 'monospace',
        fontSize: 14,
        lineHeight: 1.5,
        resize: 'none',
        outline: 'none',
      }}
    />
  );

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0a0a0b', color: '#f0f0f0', fontFamily: 'sans-serif', userSelect: dragRef.current ? 'none' : 'auto' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, position: 'relative' }}>
        <div style={{ display: 'flex', background: '#111', borderBottom: '1px solid #222', overflowX: 'auto' }}>
          {visibleFiles.map((filename) => (
            <button
              key={filename}
              onClick={() => handleFileSelect(filename)}
              style={{
                padding: '10px 20px',
                border: 'none',
                cursor: 'pointer',
                background: activeFile === filename ? '#1e1e1e' : 'transparent',
                color: activeFile === filename ? '#fff' : '#666',
                fontFamily: 'monospace',
                fontSize: 13,
                borderBottom: activeFile === filename ? '2px solid #ff5c35' : '2px solid transparent',
                whiteSpace: 'nowrap',
              }}
            >
              {filename.split('/').pop()}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }}>
          {usePlainEditor ? (
            simpleEditor
          ) : (
            <MonacoErrorBoundary onError={() => setUsePlainEditor(true)} fallback={simpleEditor}>
              <Editor
                height="100%"
                language="javascript"
                theme="vs-dark"
                value={fileContents[activeFile]}
                onChange={handleEditorChange}
                onMount={() => setUsePlainEditor(false)}
                loading={<MonacoLoadingFallback onTimeout={() => setUsePlainEditor(true)} />}
                options={{
                  fontSize: 14,
                  minimap: { enabled: false },
                  lineNumbers: 'on',
                  wordWrap: 'on',
                  scrollBeyondLastLine: false,
                  padding: { top: 16 },
                }}
              />
            </MonacoErrorBoundary>
          )}
        </div>

        {usePlainEditor && (
          <div style={{ padding: '10px 16px', borderTop: '1px solid #222', background: '#0f0f10', color: '#666', fontSize: 12 }}>
            Monaco did not load, so Spar switched to the plain text editor fallback.
          </div>
        )}
      </div>

      {/* Drag handle */}
      {chatOpen && (
        <div
          onMouseDown={onDragStart}
          style={{
            width: 4, flexShrink: 0, cursor: 'col-resize',
            background: 'transparent',
            borderLeft: '1px solid #222',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#ff5c35'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        />
      )}

      {/* Reopen button when chat is closed */}
      {!chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          style={{
            width: 28, flexShrink: 0, background: '#111', border: 'none',
            borderLeft: '1px solid #222', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#555',
          }}
          title="Open chat"
        >
          ‹
        </button>
      )}

      {/* Chat panel */}
      {chatOpen && (
        <div style={{ width: chatWidth, flexShrink: 0, display: 'flex', flexDirection: 'column', background: '#111' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #222', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#ff5c35', letterSpacing: '0.1em' }}>SPAR</div>
              <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>{scenario.title}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Timer seconds={scenario.timeLimit} onExpire={handleFinish} />
              <button
                onClick={() => setChatOpen(false)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#444', fontSize: 18, lineHeight: 1, padding: '2px 4px',
                }}
                title="Close chat"
              >
                ›
              </button>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {messages.map((message, index) => (
              <div
                key={index}
                style={{
                  alignSelf: message.role === 'assistant' ? 'flex-start' : 'flex-end',
                  maxWidth: '85%',
                  padding: '10px 14px',
                  borderRadius: message.role === 'assistant' ? '4px 12px 12px 12px' : '12px 4px 12px 12px',
                  background: message.role === 'assistant' ? '#1e1e26' : '#ff5c35',
                  color: '#f0f0f0',
                  fontSize: 14,
                  lineHeight: 1.5,
                }}
              >
                {message.content}
              </div>
            ))}
            {isThinking && (
              <div style={{ alignSelf: 'flex-start', color: '#555', fontSize: 13, fontStyle: 'italic' }}>
                thinking...
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <VoiceBar
            liveTranscript={liveTranscript}
            isListening={isListening}
            isThinking={isThinking}
            connectionState={connectionState}
            errorMessage={error}
            onStart={startListening}
            onStop={stopListening}
            onFinish={handleFinish}
            onSubmitText={handleTypedSubmit}
          />
        </div>
      )}
    </div>
  );
}
