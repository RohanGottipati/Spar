require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createServer } = require('http');
const { WebSocketServer, WebSocket } = require('ws');

const app = express();
app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

const server = createServer(app);

// ── DEEPGRAM PROXY (WebSocket) ──────────────────────────────────────────────
const wss = new WebSocketServer({ server, path: '/deepgram' });

wss.on('connection', (clientSocket) => {
  console.log('Client connected to Deepgram proxy');

  const deepgramSocket = new WebSocket(
    'wss://api.deepgram.com/v1/listen?model=nova-2&language=en&smart_format=true&interim_results=true',
    { headers: { Authorization: `Token ${process.env.DEEPGRAM_API_KEY}` } }
  );

  clientSocket.on('message', (data) => {
    if (deepgramSocket.readyState === WebSocket.OPEN) deepgramSocket.send(data);
  });

  deepgramSocket.on('message', (data) => {
    if (clientSocket.readyState === WebSocket.OPEN) clientSocket.send(data);
  });

  deepgramSocket.on('error', (err) => console.error('Deepgram error:', err));
  clientSocket.on('close', () => deepgramSocket.close());
  deepgramSocket.on('close', () => clientSocket.close());
});

// ── GEMINI PROXY (HTTP) ─────────────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  const { messages, systemPrompt } = req.body;
  const hasValidPrompt = typeof systemPrompt === 'string' && systemPrompt.trim().length > 0;
  const hasValidMessages = Array.isArray(messages) && messages.every((message) => (
    message
    && (message.role === 'user' || message.role === 'assistant')
    && typeof message.content === 'string'
    && message.content.trim().length > 0
  ));

  if (!hasValidPrompt || !hasValidMessages) {
    return res.status(400).json({ error: 'Invalid chat payload' });
  }

  if (!process.env.GEMINI_API_KEY) {
    console.error('Gemini API key is not configured');
    return res.status(500).json({ error: 'AI unavailable' });
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: messages.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
          })),
          generationConfig: { maxOutputTokens: 200, temperature: 0.7 }
        })
      }
    );

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      console.error('Gemini API error:', response.status, data);
      return res.status(500).json({ error: 'AI unavailable' });
    }

    const text = data?.candidates?.[0]?.content?.parts?.find((part) => typeof part.text === 'string')?.text?.trim();
    if (!text) {
      console.error('Gemini response missing text:', data);
      return res.status(500).json({ error: 'AI unavailable' });
    }

    return res.json({ reply: text });

  } catch (err) {
    console.error('Gemini error:', err);
    return res.status(500).json({ error: 'AI unavailable' });
  }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Spar server running on :${PORT}`));
