import { useCallback, useEffect, useRef, useState } from 'react';

const CHAT_API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');

const buildSystemPrompt = (scenario) => `
You are Alex, a senior engineer at ${scenario.company} conducting a live technical screening.
The candidate is debugging a production issue: ${scenario.description}
They have access to the codebase and are thinking out loud as they work.

Rules:
- Ask ONE short follow-up question per response. Max 2 sentences.
- Never explain the bug or give the answer away.
- Push on their reasoning, not just their actions. "Why there?" not "What did you find?"
- If they're heading the right direction, go deeper.
- If they're stuck, give a small nudge — not the answer.
- Sound human. Use contractions. No preamble. No "Great question!"
- When they propose a fix, ask about edge cases.
`;

// Pre-cached fallbacks — swap these in if Gemini is slow on stage
const FALLBACKS = [
  "What made you look there first?",
  "What would you expect to see if that hypothesis is correct?",
  "Walk me through what that function is actually doing.",
  "What's the worst case if this stays in production?",
  "If you were to fix this, what's the simplest change that works?",
  "Have you seen something like this before?",
];

const createOpeningMessage = (scenario) => ({
  role: 'assistant',
  content: `Alright — ${scenario.description}. Take a look at the codebase and walk me through where you want to start.`
});

const pickFallback = () => FALLBACKS[Math.floor(Math.random() * FALLBACKS.length)];

export function useInterviewer(scenario) {
  const [messages, setMessages] = useState(() => [createOpeningMessage(scenario)]);
  const [isThinking, setIsThinking] = useState(false);
  const messagesRef = useRef(messages);
  const pendingRequestsRef = useRef(0);
  const scenarioVersionRef = useRef(0);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    scenarioVersionRef.current += 1;
    pendingRequestsRef.current = 0;
    const openingMessage = [createOpeningMessage(scenario)];
    messagesRef.current = openingMessage;
    setMessages(openingMessage);
    setIsThinking(false);
  }, [scenario]);

  const sendMessage = useCallback(async (userText) => {
    const trimmedText = typeof userText === 'string' ? userText.trim() : '';
    if (!trimmedText) {
      return;
    }

    const scenarioVersion = scenarioVersionRef.current;
    const nextMessages = [...messagesRef.current, { role: 'user', content: trimmedText }];
    messagesRef.current = nextMessages;
    setMessages(nextMessages);
    pendingRequestsRef.current += 1;
    setIsThinking(true);

    try {
      const response = await fetch(`${CHAT_API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages, systemPrompt: buildSystemPrompt(scenario) })
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        console.error('Gemini request failed:', response.status, data);
        throw new Error(`Chat request failed with status ${response.status}`);
      }

      const reply = typeof data?.reply === 'string' ? data.reply.trim() : '';
      const content = reply || pickFallback();

      if (scenarioVersionRef.current === scenarioVersion) {
        setMessages((prev) => {
          const updatedMessages = [...prev, { role: 'assistant', content }];
          messagesRef.current = updatedMessages;
          return updatedMessages;
        });
      }

    } catch (err) {
      console.error('Gemini error:', err);
      if (scenarioVersionRef.current === scenarioVersion) {
        const fallback = pickFallback();
        setMessages((prev) => {
          const updatedMessages = [...prev, { role: 'assistant', content: fallback }];
          messagesRef.current = updatedMessages;
          return updatedMessages;
        });
      }
    } finally {
      if (scenarioVersionRef.current === scenarioVersion) {
        pendingRequestsRef.current = Math.max(0, pendingRequestsRef.current - 1);
        setIsThinking(pendingRequestsRef.current > 0);
      }
    }
  }, [scenario]);

  return { messages, isThinking, sendMessage };
}
