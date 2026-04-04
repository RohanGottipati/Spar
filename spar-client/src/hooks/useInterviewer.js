import { useCallback, useEffect, useRef, useState } from 'react';
import { buildApiUrl } from '../lib/api';

const DUPLICATE_WINDOW_MS = 1500;

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

export function useInterviewer(scenario, { onMessage } = {}) {
  const [sessionId, setSessionId] = useState('');
  const [messages, setMessages] = useState([]);
  const [isThinking, setIsThinking] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState('');
  const messagesRef = useRef([]);
  const initControllerRef = useRef(null);
  const pendingControllersRef = useRef(new Set());
  const scenarioVersionRef = useRef(0);
  const lastSendRef = useRef({ text: '', timestamp: 0 });
  const isClosedRef = useRef(false);
  const onMessageRef = useRef(onMessage);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const abortPendingRequests = useCallback(() => {
    initControllerRef.current?.abort();
    initControllerRef.current = null;

    pendingControllersRef.current.forEach((controller) => controller.abort());
    pendingControllersRef.current.clear();
  }, []);

  const finishSession = useCallback(() => {
    isClosedRef.current = true;
    abortPendingRequests();
    setIsThinking(false);
  }, [abortPendingRequests]);

  useEffect(() => {
    const scenarioVersion = scenarioVersionRef.current + 1;
    scenarioVersionRef.current = scenarioVersion;
    isClosedRef.current = false;
    lastSendRef.current = { text: '', timestamp: 0 };
    messagesRef.current = [];
    setMessages([]);
    setSessionId('');
    setIsThinking(false);
    setIsReady(false);
    setError('');
    abortPendingRequests();

    const controller = new AbortController();
    initControllerRef.current = controller;

    async function initializeSession() {
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

        if (scenarioVersionRef.current !== scenarioVersion || isClosedRef.current) {
          return;
        }

        const openingMessage = createMessage('assistant', data.openingMessage || 'Let’s start with your first instinct.', {
          ts: Date.now(),
        });

        setSessionId(data.sessionId || '');
        messagesRef.current = [openingMessage];
        setMessages([openingMessage]);
        setIsReady(true);
        onMessageRef.current?.(openingMessage);
      } catch (err) {
        if (controller.signal.aborted) {
          return;
        }

        console.error('Interviewer session init failed:', err);
        if (scenarioVersionRef.current === scenarioVersion) {
          setError('The interviewer could not connect. Reload and try again.');
          setIsReady(false);
        }
      }
    }

    initializeSession();

    return () => {
      isClosedRef.current = true;
      abortPendingRequests();
    };
  }, [abortPendingRequests, scenario]);

  const sendMessage = useCallback(async (userText, { source = 'typed' } = {}) => {
    const trimmedText = typeof userText === 'string' ? userText.trim() : '';
    if (!trimmedText || !sessionId || !isReady || isClosedRef.current) {
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

    const controller = new AbortController();
    pendingControllersRef.current.add(controller);

    try {
      const response = await fetch(buildApiUrl(`/api/interview/sessions/${sessionId}/messages`), {
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
      pendingControllersRef.current.delete(controller);
      if (scenarioVersionRef.current === scenarioVersion && !isClosedRef.current) {
        setIsThinking(false);
      }
    }
  }, [isReady, sessionId]);

  return { sessionId, messages, isThinking, isReady, error, sendMessage, finishSession };
}
