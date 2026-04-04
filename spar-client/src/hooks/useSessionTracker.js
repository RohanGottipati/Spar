import { useCallback, useEffect, useRef } from 'react';

function createInitialTracker({ scenarioId, initialFile }) {
  const startedAt = Date.now();

  return {
    sessionId: null,
    scenarioId,
    startedAt,
    finishedAt: null,
    firstEditAt: null,
    activeFileAtFinish: null,
    fileOpens: initialFile ? [{ file: initialFile, ts: startedAt }] : [],
    editorEvents: [],
    utterances: [],
    chatHistory: [],
    finalFiles: {},
  };
}

function cloneFinalFiles(finalFiles) {
  return Object.fromEntries(
    Object.entries(finalFiles || {}).map(([filename, content]) => [filename, typeof content === 'string' ? content : ''])
  );
}

export function useSessionTracker({ scenarioId, initialFile }) {
  const trackerRef = useRef(createInitialTracker({ scenarioId, initialFile }));

  useEffect(() => {
    trackerRef.current = createInitialTracker({ scenarioId, initialFile });
  }, [initialFile, scenarioId]);

  const setSessionId = useCallback((sessionId) => {
    trackerRef.current.sessionId = sessionId;
  }, []);

  const recordFileOpen = useCallback((file, ts = Date.now()) => {
    if (!file) {
      return;
    }

    trackerRef.current.fileOpens.push({ file, ts });
  }, []);

  const recordEditorChange = useCallback((event) => {
    if (!event?.file) {
      return;
    }

    if (!trackerRef.current.firstEditAt) {
      trackerRef.current.firstEditAt = event.ts || Date.now();
    }

    trackerRef.current.editorEvents.push({
      file: event.file,
      ts: event.ts || Date.now(),
      versionId: Number.isFinite(event.versionId) ? event.versionId : null,
      isUndoing: Boolean(event.isUndoing),
      isRedoing: Boolean(event.isRedoing),
      changes: Array.isArray(event.changes)
        ? event.changes.map((change) => ({
            rangeOffset: Number.isFinite(change.rangeOffset) ? change.rangeOffset : 0,
            rangeLength: Number.isFinite(change.rangeLength) ? change.rangeLength : 0,
            text: typeof change.text === 'string' ? change.text : '',
          }))
        : [],
    });
  }, []);

  const recordUtterance = useCallback(({ text, source, ts = Date.now() }) => {
    const trimmedText = typeof text === 'string' ? text.trim() : '';
    if (!trimmedText) {
      return;
    }

    trackerRef.current.utterances.push({
      ts,
      text: trimmedText,
      source: source || 'unknown',
    });
  }, []);

  const recordChatMessage = useCallback((message) => {
    const trimmedContent = typeof message?.content === 'string' ? message.content.trim() : '';
    if (!trimmedContent || !message?.role) {
      return;
    }

    trackerRef.current.chatHistory.push({
      ts: typeof message.ts === 'number' ? message.ts : Date.now(),
      role: message.role,
      content: trimmedContent,
      source: message.source || null,
    });
  }, []);

  const finalize = useCallback(({ finalFiles, activeFileAtFinish, finishedAt = Date.now() }) => {
    trackerRef.current.finishedAt = finishedAt;
    trackerRef.current.activeFileAtFinish = activeFileAtFinish || null;
    trackerRef.current.finalFiles = cloneFinalFiles(finalFiles);

    return {
      sessionId: trackerRef.current.sessionId,
      scenarioId: trackerRef.current.scenarioId,
      startedAt: trackerRef.current.startedAt,
      finishedAt: trackerRef.current.finishedAt,
      firstEditAt: trackerRef.current.firstEditAt,
      activeFileAtFinish: trackerRef.current.activeFileAtFinish,
      fileOpens: [...trackerRef.current.fileOpens],
      editorEvents: [...trackerRef.current.editorEvents],
      utterances: [...trackerRef.current.utterances],
      chatHistory: [...trackerRef.current.chatHistory],
      finalFiles: cloneFinalFiles(trackerRef.current.finalFiles),
    };
  }, []);

  return {
    finalize,
    recordChatMessage,
    recordEditorChange,
    recordFileOpen,
    recordUtterance,
    setSessionId,
  };
}
