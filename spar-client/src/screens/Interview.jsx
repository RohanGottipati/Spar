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

function formatDifficultyLabel(difficulty) {
  if (typeof difficulty !== 'string' || !difficulty) {
    return 'Unknown';
  }

  return difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
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
  const [chatWidth, setChatWidth] = useState(420);
  const chatEndRef = useRef(null);
  const activeFileRef = useRef(initialFile);
  const editorListenerRef = useRef(null);
  const dragRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(420);
  const tracker = useSessionTracker({ scenarioId: scenario.id, initialFile });

  const onDragStart = useCallback((e) => {
    dragRef.current = true;
    setIsDragging(true);
    dragStartX.current = e.clientX;
    dragStartWidth.current = chatWidth;

    const onMove = (e) => {
      if (!dragRef.current) return;
      const delta = dragStartX.current - e.clientX;
      setChatWidth(Math.min(620, Math.max(320, dragStartWidth.current + delta)));
    };
    const onUp = () => {
      dragRef.current = false;
      setIsDragging(false);
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
  const difficultyLabel = formatDifficultyLabel(scenario.difficulty);

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#08090d', color: '#f0f0f0', fontFamily: 'Inter, sans-serif', userSelect: isDragging ? 'none' : 'auto' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: 'linear-gradient(180deg, #0b0c10 0%, #090a0e 100%)' }}>
        <div
          style={{
            padding: '18px 22px 16px',
            borderBottom: '1px solid #1a1b22',
            background: 'linear-gradient(180deg, rgba(20,20,24,0.96) 0%, rgba(15,16,20,0.92) 100%)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 11, color: '#7f818d', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 10 }}>
                Live Debugging Workspace
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.04em', marginBottom: 8 }}>
                {scenario.title}
              </div>
              <div style={{ color: '#a5a7b3', lineHeight: 1.6, maxWidth: 620 }}>
                {scenario.description}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <MetaBadge label="Company" value={scenario.company} />
              <MetaBadge label="Difficulty" value={difficultyLabel} />
              <MetaBadge label="Files" value={`${visibleFiles.length}`} />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', background: '#0d0f14', borderBottom: '1px solid #1a1b22', overflowX: 'auto' }}>
          {visibleFiles.map((filename) => (
            <button
              key={filename}
              onClick={() => handleFileSelect(filename)}
              style={{
                padding: '13px 20px', border: 'none', cursor: 'pointer',
                background: activeFile === filename ? '#141720' : 'transparent',
                color: activeFile === filename ? '#f0f0f0' : '#666a76',
                fontFamily: 'monospace', fontSize: 13,
                borderBottom: activeFile === filename ? '2px solid #ff5c35' : '2px solid transparent',
                whiteSpace: 'nowrap', transition: 'color 0.15s, background 0.15s',
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
          <div style={{ padding: '10px 16px', borderTop: '1px solid #1e1e1e', background: '#0d0f14', color: '#666a76', fontSize: 12 }}>
            Monaco did not load, so Spar switched to the plain text editor fallback.
          </div>
        )}
      </div>

      {chatOpen && (
        <div
          onMouseDown={onDragStart}
          style={{
            width: 4, flexShrink: 0, cursor: 'col-resize',
            background: 'transparent', borderLeft: '1px solid #20212a',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#ff5c35'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        />
      )}

      {!chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          style={{
            width: 34, flexShrink: 0, background: '#0f1017', border: 'none',
            borderLeft: '1px solid #20212a', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#666a76', fontSize: 18,
          }}
          title="Open chat"
        >
          ‹
        </button>
      )}

      {chatOpen && (
        <div style={{ width: chatWidth, flexShrink: 0, display: 'flex', flexDirection: 'column', background: 'linear-gradient(180deg, #101118 0%, #0c0d13 100%)', borderLeft: '1px solid #20212a' }}>
          <div style={{ padding: '16px 20px', borderBottom: '2px solid #ff5c35', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, background: '#12131b' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              {onBack && (
                <button
                  onClick={handleBack}
                  title="Exit interview"
                  style={{
                    background: 'transparent', border: '1px solid #2a2d36', color: '#8d90a0',
                    padding: '5px 12px', borderRadius: 6, cursor: 'pointer',
                    fontFamily: 'Inter, sans-serif', fontSize: 12,
                    transition: 'color 0.15s, border-color 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#f0f0f0'; e.currentTarget.style.borderColor = '#555'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#8d90a0'; e.currentTarget.style.borderColor = '#2a2d36'; }}
                >
                  ← Back
                </button>
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>Interviewer Console</div>
                <div style={{ fontSize: 12, color: '#8d90a0', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {scenario.company} · {scenario.title}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Timer seconds={scenario.timeLimit} onExpire={handleFinish} />
              <button
                onClick={() => setChatOpen(false)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#666a76', fontSize: 18, lineHeight: 1, padding: '2px 4px',
                  transition: 'color 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.color = '#888'}
                onMouseLeave={e => e.currentTarget.style.color = '#666a76'}
                title="Close chat"
              >
                ›
              </button>
            </div>
          </div>

          {interviewerError && (
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #242633', background: '#180f11', color: '#ff8c6b', fontSize: 13 }}>
              {interviewerError}
            </div>
          )}


          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {!isReady && !interviewerError && messages.length === 0 && (
              <div
                style={{
                  padding: '14px 16px',
                  borderRadius: 14,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  color: '#8d90a0',
                  lineHeight: 1.6,
                }}
              >
                Connecting interviewer...
              </div>
            )}

            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}

            {isThinking && <ThinkingBubble />}
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

function MetaBadge({ label, value }) {
  return (
    <div
      style={{
        minWidth: 120,
        padding: '12px 14px',
        borderRadius: 14,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div style={{ color: '#7f818d', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ color: '#f3f4f6', fontSize: 15, fontWeight: 700 }}>
        {value}
      </div>
    </div>
  );
}

function MessageBubble({ message }) {
  const isAssistant = message.role === 'assistant';
  const accent = isAssistant ? '#5b9cf6' : '#ff5c35';

  return (
    <div style={{ alignSelf: isAssistant ? 'flex-start' : 'flex-end', maxWidth: '88%' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 8,
          justifyContent: isAssistant ? 'flex-start' : 'flex-end',
        }}
      >
        {isAssistant && <RoleBadge label="AI" accent={accent} />}
        <div style={{ color: '#7f818d', fontSize: 12, fontWeight: 600 }}>
          {isAssistant ? 'Interviewer' : 'You'}
        </div>
        {!isAssistant && <RoleBadge label="You" accent={accent} />}
      </div>

      <div
        style={{
          padding: '13px 16px',
          borderRadius: isAssistant ? '8px 18px 18px 18px' : '18px 8px 18px 18px',
          background: isAssistant ? 'rgba(255,255,255,0.04)' : '#ff5c35',
          border: isAssistant ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(255,92,53,0.18)',
          color: isAssistant ? '#d8dbe3' : '#fff',
          fontSize: 14,
          lineHeight: 1.72,
          boxShadow: isAssistant ? 'none' : '0 12px 30px rgba(255,92,53,0.18)',
        }}
      >
        {message.content}
      </div>
    </div>
  );
}

function RoleBadge({ label, accent }) {
  return (
    <div
      style={{
        minWidth: 24,
        height: 24,
        padding: '0 6px',
        borderRadius: 999,
        background: `${accent}18`,
        color: accent,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 11,
        fontWeight: 700,
      }}
    >
      {label}
    </div>
  );
}

function ThinkingBubble() {
  return (
    <div style={{ alignSelf: 'flex-start', maxWidth: '82%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <RoleBadge label="AI" accent="#5b9cf6" />
        <div style={{ color: '#7f818d', fontSize: 12, fontWeight: 600 }}>
          Interviewer
        </div>
      </div>
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '12px 15px',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '8px 18px 18px 18px',
        }}
      >
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: '#5b9cf6',
              animation: `pulse 1.2s ease-in-out ${index * 0.18}s infinite`,
            }}
          />
        ))}
        <span style={{ color: '#a5a7b3', fontSize: 13 }}>
          Thinking through the next follow-up...
        </span>
      </div>
    </div>
  );
}
