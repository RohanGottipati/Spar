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

function getVisibleFilesMap(scenario) {
  return Object.fromEntries(
    Object.entries(scenario.files || {}).filter(([filename]) => !filename.includes('.fixed.'))
  );
}

function getLanguageForFile(filename) {
  if (filename.endsWith('.json')) {
    return 'json';
  }

  if (filename.endsWith('.css')) {
    return 'css';
  }

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
  const chatEndRef = useRef(null);
  const activeFileRef = useRef(initialFile);
  const editorListenerRef = useRef(null);
  const tracker = useSessionTracker({ scenarioId: scenario.id, initialFile });

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
    if (sessionId) {
      tracker.setSessionId(sessionId);
    }
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
      prev[filename] === normalizedValue
        ? prev
        : { ...prev, [filename]: normalizedValue }
    ));
  }, []);

  const recordPlainEditorChange = useCallback((filename, value) => {
    tracker.recordEditorChange({
      file: filename,
      ts: Date.now(),
      versionId: null,
      changes: [
        {
          rangeOffset: 0,
          rangeLength: 0,
          text: value ?? '',
        },
      ],
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

    if (usePlainEditor) {
      recordPlainEditorChange(filename, value);
    }
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
    if (isFinishing) {
      return;
    }

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
  const interactionDisabled = isFinishing;

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0a0a0b', color: '#f0f0f0', fontFamily: 'sans-serif' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid #222' }}>
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
                path={activeFile}
                language={getLanguageForFile(activeFile)}
                theme="vs-dark"
                value={fileContents[activeFile] ?? ''}
                onMount={handleMonacoMount}
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

      <div style={{ width: 380, display: 'flex', flexDirection: 'column', background: '#111' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #222', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {onBack && (
              <button
                onClick={handleBack}
                style={{
                  background: 'transparent',
                  color: '#666',
                  border: '1px solid #333',
                  borderRadius: 8,
                  padding: '8px 10px',
                  cursor: 'pointer',
                  fontSize: 12,
                  lineHeight: 1,
                }}
              >
                ← Back
              </button>
            )}
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#ff5c35', letterSpacing: '0.1em' }}>SPAR</div>
              <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>{scenario.title}</div>
            </div>
          </div>
          <Timer seconds={scenario.timeLimit} onExpire={handleFinish} />
        </div>

        {interviewerError && (
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #222', background: '#161014', color: '#ff8c6b', fontSize: 13 }}>
            {interviewerError}
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {!isReady && !interviewerError && messages.length === 0 && (
            <div style={{ alignSelf: 'flex-start', color: '#555', fontSize: 13, fontStyle: 'italic' }}>
              connecting interviewer...
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
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
    </div>
  );
}
