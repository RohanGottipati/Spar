import { useCallback, useEffect, useRef, useState } from 'react';
import { buildApiUrl } from '../lib/api';

const DUPLICATE_WINDOW_MS = 1500;
const REQUEST_TIMEOUT_MS = 10_000;

const FALLBACKS = [
  'What made you look there first?',
  'What would you expect to see if that hypothesis is correct?',
  'Walk me through what that function is actually doing.',
  "What's the worst case if this stays in production?",
  "If you were to fix this, what's the simplest change that works?",
  'What would you validate after that change?',
];

function createMessage(role, content, extra = {}) {
  const messageId = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    id: messageId,
    role,
    content,
    ts: extra.ts || Date.now(),
    source: extra.source || null,
  };
}

function pickFallback() {
  return FALLBACKS[Math.floor(Math.random() * FALLBACKS.length)];
}

function buildOpeningMessage(scenario) {
  return `Alright — ${scenario.description}. Take a look at the codebase and walk me through where you want to start.`;
}

function createTimedAbortController(timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  let didTimeout = false;
  const timeoutId = window.setTimeout(() => {
    didTimeout = true;
    controller.abort(new DOMException('Request timed out', 'TimeoutError'));
  }, timeoutMs);

  return {
    controller,
    clear: () => window.clearTimeout(timeoutId),
    cancel: () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    },
    timedOut: () => didTimeout,
  };
}

export function useInterviewer(scenario, { onMessage, onAssistantAudio } = {}) {
  const [sessionId, setSessionId] = useState('');
  const [messages, setMessages] = useState([]);
  const [isThinking, setIsThinking] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState('');
  const messagesRef = useRef([]);
  const initControllerRef = useRef(null);
  const pendingControllersRef = useRef(new Set());
  const initPromiseRef = useRef(null);
  const scenarioVersionRef = useRef(0);
  const lastSendRef = useRef({ text: '', timestamp: 0 });
  const isClosedRef = useRef(false);
  const sessionIdRef = useRef('');
  const isThinkingRef = useRef(false);
  const onMessageRef = useRef(onMessage);
  const onAssistantAudioRef = useRef(null);

  const destroyRemoteSession = useCallback((targetSessionId) => {
    const normalizedSessionId = typeof targetSessionId === 'string' ? targetSessionId.trim() : '';
    if (!normalizedSessionId) {
      return;
    }

    fetch(buildApiUrl(`/api/interview/sessions/${normalizedSessionId}`), {
      method: 'DELETE',
    }).catch((err) => {
      console.error('Interview session cleanup failed:', err);
    });
  }, []);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    onAssistantAudioRef.current = onAssistantAudio || null;
  }, [onAssistantAudio]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    isThinkingRef.current = isThinking;
  }, [isThinking]);

  const abortPendingRequests = useCallback(() => {
    initControllerRef.current?.cancel();
    initControllerRef.current = null;
    initPromiseRef.current = null;

    pendingControllersRef.current.forEach((request) => request.cancel());
    pendingControllersRef.current.clear();
  }, []);

  const ensureSession = useCallback(async () => {
    if (sessionIdRef.current) {
      return sessionIdRef.current;
    }

    if (initPromiseRef.current) {
      return initPromiseRef.current;
    }

    const timedController = createTimedAbortController();
    const { controller } = timedController;
    initControllerRef.current = timedController;

    const requestPromise = (async () => {
      try {
        const response = await fetch(buildApiUrl('/api/interview/sessions'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scenarioId: scenario.id }),
          signal: controller.signal,
        });

        const data = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(data?.error || `Session request failed with status ${response.status}`);
        }

        if (isClosedRef.current) {
          return '';
        }

        const nextSessionId = typeof data?.sessionId === 'string' ? data.sessionId : '';
        sessionIdRef.current = nextSessionId;
        setSessionId(nextSessionId);
        setError('');
        return nextSessionId;
      } catch (err) {
        if (controller.signal.aborted) {
          if (timedController.timedOut() && !isClosedRef.current) {
            setError('The interviewer did not start. Check that the backend is running on port 3001, then reload.');
          }

          return '';
        }

        console.error('Interviewer session init failed:', err);
        if (!isClosedRef.current) {
          setError('The interviewer could not connect. Reload and try again.');
        }

        return '';
      } finally {
        timedController.clear();
        if (initControllerRef.current === timedController) {
          initControllerRef.current = null;
        }
        if (initPromiseRef.current === requestPromise) {
          initPromiseRef.current = null;
        }
      }
    })();

    initPromiseRef.current = requestPromise;
    return requestPromise;
  }, [scenario.id]);

  const finishSession = useCallback(() => {
    isClosedRef.current = true;
    abortPendingRequests();
    setIsThinking(false);
    destroyRemoteSession(sessionIdRef.current);
    sessionIdRef.current = '';
    setSessionId('');
  }, [abortPendingRequests, destroyRemoteSession]);

  useEffect(() => {
    scenarioVersionRef.current += 1;
    isClosedRef.current = false;
    lastSendRef.current = { text: '', timestamp: 0 };
    destroyRemoteSession(sessionIdRef.current);
    sessionIdRef.current = '';
    setSessionId('');
    const openingMessage = createMessage('assistant', buildOpeningMessage(scenario), {
      ts: Date.now(),
    });
    messagesRef.current = [openingMessage];
    setMessages([openingMessage]);
    setIsThinking(false);
    setIsReady(true);
    setError('');
    abortPendingRequests();
    onMessageRef.current?.(openingMessage);

    return () => {
      isClosedRef.current = true;
      abortPendingRequests();
      destroyRemoteSession(sessionIdRef.current);
      sessionIdRef.current = '';
    };
  }, [abortPendingRequests, destroyRemoteSession, scenario]);

  const sendMessage = useCallback(async (userText, { source = 'typed' } = {}) => {
    const trimmedText = typeof userText === 'string' ? userText.trim() : '';
    if (!trimmedText || !isReady || isClosedRef.current || isThinkingRef.current) {
      return false;
    }

    const now = Date.now();
    if (
      lastSendRef.current.text === trimmedText
      && now - lastSendRef.current.timestamp < DUPLICATE_WINDOW_MS
    ) {
      return false;
    }

    lastSendRef.current = { text: trimmedText, timestamp: now };
    const scenarioVersion = scenarioVersionRef.current;
    const userMessage = createMessage('user', trimmedText, { ts: now, source });
    const nextMessages = [...messagesRef.current, userMessage];
    messagesRef.current = nextMessages;
    setMessages(nextMessages);
    onMessageRef.current?.(userMessage);
    setIsThinking(true);

    const timedController = createTimedAbortController();
    const { controller } = timedController;
    pendingControllersRef.current.add(timedController);

    try {
      const activeSessionId = await ensureSession();
      if (!activeSessionId) {
        return false;
      }

      const response = await fetch(buildApiUrl(`/api/interview/sessions/${activeSessionId}/messages`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: trimmedText,
          source,
          clientTs: now,
        }),
        signal: controller.signal,
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || `Message request failed with status ${response.status}`);
      }

      const reply = typeof data?.reply === 'string' && data.reply.trim() ? data.reply.trim() : pickFallback();
      if (scenarioVersionRef.current === scenarioVersion && !isClosedRef.current) {
        const assistantMessage = createMessage('assistant', reply, {
          ts: typeof data?.replyTs === 'number' ? data.replyTs : Date.now(),
        });

        setMessages((prev) => {
          const updatedMessages = [...prev, assistantMessage];
          messagesRef.current = updatedMessages;
          return updatedMessages;
        });
        onMessageRef.current?.(assistantMessage);
        if (typeof data?.audioBase64 === 'string' && data.audioBase64.length > 0) {
          onAssistantAudioRef.current?.({
            audioBase64: data.audioBase64,
            audioMimeType: typeof data?.audioMimeType === 'string' ? data.audioMimeType : 'audio/wav',
          });
        }
      }

      return true;
    } catch (err) {
      if (controller.signal.aborted) {
        return false;
      }

      console.error('Interviewer turn failed:', err);
      if (scenarioVersionRef.current === scenarioVersion && !isClosedRef.current) {
        const fallbackMessage = createMessage('assistant', pickFallback(), { ts: Date.now() });
        setMessages((prev) => {
          const updatedMessages = [...prev, fallbackMessage];
          messagesRef.current = updatedMessages;
          return updatedMessages;
        });
        onMessageRef.current?.(fallbackMessage);
      }

      return false;
    } finally {
      timedController.clear();
      pendingControllersRef.current.delete(timedController);
      if (scenarioVersionRef.current === scenarioVersion && !isClosedRef.current) {
        setIsThinking(false);
      }
    }
  }, [ensureSession, isReady]);

  return { sessionId, messages, isThinking, isReady, error, sendMessage, finishSession };
}
