import { useState, useCallback } from 'react';

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

export function useInterviewer(scenario) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: `Alright — ${scenario.description}. Take a look at the codebase and walk me through where you want to start.`
    }
  ]);
  const [isThinking, setIsThinking] = useState(false);

  const sendMessage = useCallback(async (userText) => {
    const newMessages = [...messages, { role: 'user', content: userText }];
    setMessages(newMessages);
    setIsThinking(true);

    try {
      const response = await fetch('http://localhost:3001/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, systemPrompt: buildSystemPrompt(scenario) })
      });

      const data = await response.json();
      const reply = data.reply || FALLBACKS[Math.floor(Math.random() * FALLBACKS.length)];
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);

    } catch (err) {
      console.error('Gemini error:', err);
      const fallback = FALLBACKS[Math.floor(Math.random() * FALLBACKS.length)];
      setMessages(prev => [...prev, { role: 'assistant', content: fallback }]);
    } finally {
      setIsThinking(false);
    }
  }, [messages, scenario]);

  return { messages, isThinking, sendMessage };
}
