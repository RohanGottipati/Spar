import { Component, useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { useLiveVoiceInterview } from '../hooks/useLiveVoiceInterview';
import { useSessionTracker } from '../hooks/useSessionTracker';
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

function MonacoLoadingFallback({ onUsePlainEditor }) {
  const [canUsePlainEditor, setCanUsePlainEditor] = useState(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setCanUsePlainEditor(true);
    }, 3500);

    return () => window.clearTimeout(timeoutId);
  }, []);

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 14,
      color: '#777',
      fontSize: 14,
      background: '#111',
    }}>
      <div>Loading editor...</div>
      {canUsePlainEditor && (
        <button
          onClick={onUsePlainEditor}
          style={{
            background: 'transparent',
            color: '#aaa',
            border: '1px solid #333',
            padding: '10px 14px',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          Use plain text editor
        </button>
      )}
    </div>
  );
}

function getVisibleFilesMap(scenario) {
  return Object.fromEntries(
    Object.entries(scenario.files || {}).filter(([filename]) => !filename.includes('.fixed.'))
  );
}

function getLanguageForFile(filename) {
  if (filename.endsWith('.json')) return 'json';
  if (filename.endsWith('.css')) return 'css';
  return 'javascript';
}

export default function Interview({ scenario, onFinish, onBack, onScenarioUnavailable }) {
  const visibleFilesMap = getVisibleFilesMap(scenario);
  const visibleFiles = Object.keys(visibleFilesMap);
  const initialFile = visibleFiles[0] || '';
  const [activeFile, setActiveFile] = useState(initialFile);
  const [fileContents, setFileContents] = useState(() => ({ ...visibleFilesMap }));
  const [usePlainEditor, setUsePlainEditor] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const [chatWidth, setChatWidth] = useState(380);
  const chatEndRef = useRef(null);
  const activeFileRef = useRef(initialFile);
  const editorListenerRef = useRef(null);
  const dragRef = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(380);
  const tracker = useSessionTracker({ scenarioId: scenario.id, initialFile });

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

  const handleTrackedMessage = useCallback((message) => {
    tracker.recordChatMessage(message);
  }, [tracker]);

  const handleTrackedUtterance = useCallback((utterance) => {
    tracker.recordUtterance(utterance);
  }, [tracker]);

  const {
    sessionId,
    messages,
    isReady,
    isThinking,
    isListening,
    isAgentSpeaking,
    liveTranscript,
    connectionState,
    error: interviewerError,
    startListening,
    stopListening,
    sendTextMessage,
    finishSession,
  } = useLiveVoiceInterview(scenario, {
    onFinalMessage: handleTrackedMessage,
    onFinalUtterance: handleTrackedUtterance,
    onScenarioNotFound: onScenarioUnavailable,
  });

  useEffect(() => {
    if (sessionId) tracker.setSessionId(sessionId);
  }, [sessionId, tracker]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [isAgentSpeaking, isThinking, messages]);

  useEffect(() => () => {
    editorListenerRef.current?.dispose?.();
  }, []);

  const updateFileContent = useCallback((filename, nextValue) => {
    const normalizedValue = nextValue ?? '';
    setFileContents((prev) => (
      prev[filename] === normalizedValue ? prev : { ...prev, [filename]: normalizedValue }
    ));
  }, []);

  const recordPlainEditorChange = useCallback((filename, value) => {
    tracker.recordEditorChange({
      file: filename,
      ts: Date.now(),
      versionId: null,
      changes: [{ rangeOffset: 0, rangeLength: 0, text: value ?? '' }],
    });
  }, [tracker]);

  const handleVoiceStart = useCallback(() => {
    startListening();
  }, [startListening]);

  const handleVoiceStop = useCallback(() => {
    stopListening();
  }, [stopListening]);

  const handleFileSelect = useCallback((filename) => {
    setActiveFile(filename);
    activeFileRef.current = filename;
    tracker.recordFileOpen(filename);
  }, [tracker]);

  const handleEditorChange = useCallback((value) => {
    const filename = activeFileRef.current;
    updateFileContent(filename, value);
    if (usePlainEditor) recordPlainEditorChange(filename, value);
  }, [recordPlainEditorChange, updateFileContent, usePlainEditor]);

  const handleMonacoMount = useCallback((editor) => {
    setUsePlainEditor(false);
    editorListenerRef.current?.dispose?.();
    editorListenerRef.current = editor.onDidChangeModelContent((event) => {
      const filename = activeFileRef.current;
      const nextValue = editor.getValue();
      tracker.recordEditorChange({
        file: filename,
        ts: Date.now(),
        versionId: event.versionId,
        isUndoing: event.isUndoing,
        isRedoing: event.isRedoing,
        changes: event.changes.map((change) => ({
          rangeOffset: change.rangeOffset,
          rangeLength: change.rangeLength,
          text: change.text,
        })),
      });
      updateFileContent(filename, nextValue);
    });
  }, [setUsePlainEditor, tracker, updateFileContent]);

  const handleUnmount = useEffectEvent(() => {
    finishSession();
  });

  useEffect(() => () => {
    handleUnmount();
  }, []);

  const handleTypedSubmit = useCallback((text) => {
    sendTextMessage(text);
  }, [sendTextMessage]);

  const handleBack = useCallback(() => {
    finishSession();
    onBack?.();
  }, [finishSession, onBack]);

  const handleFinish = useCallback(() => {
    if (isFinishing) return;
    setIsFinishing(true);
    finishSession();
    const trackerPayload = tracker.finalize({
      finalFiles: fileContents,
      activeFileAtFinish: activeFileRef.current,
      finishedAt: Date.now(),
    });
    onFinish({
      sessionId,
      scenarioId: scenario.id,
      tracker: trackerPayload,
    });
  }, [fileContents, finishSession, isFinishing, onFinish, scenario.id, sessionId, tracker]);

  const simpleEditor = (
    <textarea
      value={fileContents[activeFile] ?? ''}
      onChange={(event) => handleEditorChange(event.target.value)}
      spellCheck={false}
      style={{
        width: '100%', height: '100%', padding: 16, border: 'none',
        background: '#111', color: '#f0f0f0', fontFamily: 'monospace',
        fontSize: 14, lineHeight: 1.5, resize: 'none', outline: 'none',
      }}
    />
  );

  const interactionDisabled = isFinishing;

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0a0a0b', color: '#f0f0f0', fontFamily: 'Inter, sans-serif', userSelect: dragRef.current ? 'none' : 'auto' }}>

      {/* Editor panel */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ display: 'flex', background: '#0d0d0f', borderBottom: '1px solid #1e1e1e', overflowX: 'auto' }}>
          {visibleFiles.map((filename) => (
            <button
              key={filename}
              onClick={() => handleFileSelect(filename)}
              style={{
                padding: '11px 20px', border: 'none', cursor: 'pointer',
                background: activeFile === filename ? '#141416' : 'transparent',
                color: activeFile === filename ? '#f0f0f0' : '#555',
                fontFamily: 'monospace', fontSize: 13,
                borderBottom: activeFile === filename ? '2px solid #ff5c35' : '2px solid transparent',
                whiteSpace: 'nowrap', transition: 'color 0.15s',
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
                path={activeFile}
                language={getLanguageForFile(activeFile)}
                theme="vs-dark"
                value={fileContents[activeFile] ?? ''}
                onMount={handleMonacoMount}
                loading={<MonacoLoadingFallback onUsePlainEditor={() => setUsePlainEditor(true)} />}
                options={{
                  fontSize: 14, minimap: { enabled: false }, lineNumbers: 'on',
                  wordWrap: 'on', scrollBeyondLastLine: false, padding: { top: 16 },
                }}
              />
            </MonacoErrorBoundary>
          )}
        </div>

        {usePlainEditor && (
          <div style={{ padding: '10px 16px', borderTop: '1px solid #1e1e1e', background: '#0d0d0f', color: '#555', fontSize: 12 }}>
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
            background: 'transparent', borderLeft: '1px solid #222',
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
            width: 28, flexShrink: 0, background: '#0f0f14', border: 'none',
            borderLeft: '1px solid #222', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#444', fontSize: 18,
          }}
          title="Open chat"
        >
          ‹
        </button>
      )}

      {/* Chat panel */}
      {chatOpen && (
        <div style={{ width: chatWidth, flexShrink: 0, display: 'flex', flexDirection: 'column', background: '#0f0f14', borderLeft: '1px solid #222' }}>
          <div style={{ padding: '14px 20px', borderBottom: '2px solid #ff5c35', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#13131a' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {onBack && (
                <button
                  onClick={handleBack}
                  title="Exit interview"
                  style={{
                    background: 'transparent', border: '1px solid #2a2a2a', color: '#666',
                    padding: '5px 12px', borderRadius: 6, cursor: 'pointer',
                    fontFamily: 'Inter, sans-serif', fontSize: 12,
                    transition: 'color 0.15s, border-color 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#f0f0f0'; e.currentTarget.style.borderColor = '#555'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#666'; e.currentTarget.style.borderColor = '#2a2a2a'; }}
                >
                  ← Back
                </button>
              )}
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', letterSpacing: '-0.01em', fontFamily: 'Inter, sans-serif' }}>Spar</div>
                <div style={{ fontSize: 11, color: '#666', marginTop: 2, fontFamily: 'Inter, sans-serif' }}>{scenario.title}</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Timer seconds={scenario.timeLimit} onExpire={handleFinish} />
              <button
                onClick={() => setChatOpen(false)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#444', fontSize: 18, lineHeight: 1, padding: '2px 4px',
                  transition: 'color 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.color = '#888'}
                onMouseLeave={e => e.currentTarget.style.color = '#444'}
                title="Close chat"
              >
                ›
              </button>
            </div>
          </div>

          {interviewerError && (
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #1e1e1e', background: '#130d0d', color: '#ff8c6b', fontSize: 13 }}>
              {interviewerError}
            </div>
          )}

          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {!isReady && !interviewerError && messages.length === 0 && (
              <div style={{ alignSelf: 'flex-start', color: '#444', fontSize: 13, fontStyle: 'italic' }}>
                connecting interviewer...
              </div>
            )}

            {messages.map((message) => (
              <div
                key={message.id}
                style={{
                  alignSelf: message.role === 'assistant' ? 'flex-start' : 'flex-end',
                  maxWidth: '85%', padding: '11px 15px',
                  borderRadius: message.role === 'assistant' ? '4px 14px 14px 14px' : '14px 4px 14px 14px',
                  background: message.role === 'assistant' ? '#1a1a24' : '#ff5c35',
                  border: message.role === 'assistant' ? '1px solid #2a2a38' : 'none',
                  color: message.role === 'assistant' ? '#ddd' : '#fff',
                  fontSize: 14, lineHeight: 1.65, fontFamily: 'Inter, sans-serif',
                }}
              >
                {message.content}
              </div>
            ))}

            {isThinking && (
              <div style={{ alignSelf: 'flex-start', display: 'flex', gap: 5, padding: '10px 14px', background: '#1a1a24', border: '1px solid #2a2a38', borderRadius: '4px 14px 14px 14px' }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{
                    width: 6, height: 6, borderRadius: '50%', background: '#555',
                    animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                  }} />
                ))}
              </div>
            )}
            <style>{`@keyframes pulse { 0%,80%,100%{opacity:0.3} 40%{opacity:1} }`}</style>
            <div ref={chatEndRef} />
          </div>

          <VoiceBar
            liveTranscript={liveTranscript}
            isListening={isListening}
            isThinking={isThinking}
            isAgentSpeaking={isAgentSpeaking}
            connectionState={connectionState}
            errorMessage={interviewerError}
            sessionReady={isReady}
            disabled={interactionDisabled}
            disableFinish={isFinishing}
            onStart={handleVoiceStart}
            onStop={handleVoiceStop}
            onFinish={handleFinish}
            onSubmitText={handleTypedSubmit}
          />
        </div>
      )}
    </div>
  );
}
