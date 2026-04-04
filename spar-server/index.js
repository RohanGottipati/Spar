require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const { createServer } = require('http');
const { WebSocketServer, WebSocket } = require('ws');

const app = express();
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const VOICE_FALLBACK_MESSAGE = 'Voice is unavailable right now. Use the text fallback.';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const server = createServer(app);

function safeSendJson(socket, payload) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    deepgramConfigured: Boolean(process.env.DEEPGRAM_API_KEY),
    geminiModel: GEMINI_MODEL,
  });
});

const wss = new WebSocketServer({ server, path: '/deepgram' });

wss.on('connection', (clientSocket) => {
  console.log('Client connected to Deepgram proxy');

  if (!process.env.DEEPGRAM_API_KEY) {
    safeSendJson(clientSocket, { type: 'error', message: VOICE_FALLBACK_MESSAGE });
    clientSocket.close();
    return;
  }

  const deepgramSocket = new WebSocket(
    'wss://api.deepgram.com/v1/listen?model=nova-2&language=en&smart_format=true&interim_results=true',
    { headers: { Authorization: `Token ${process.env.DEEPGRAM_API_KEY}` } }
  );

  clientSocket.on('message', (data, isBinary) => {
    if (deepgramSocket.readyState === WebSocket.OPEN) {
      deepgramSocket.send(data, { binary: isBinary });
    }
  });

  deepgramSocket.on('message', (data, isBinary) => {
    if (clientSocket.readyState === WebSocket.OPEN) {
      clientSocket.send(data, { binary: isBinary });
    }
  });

  deepgramSocket.on('error', (err) => {
    console.error('Deepgram error:', err);
    safeSendJson(clientSocket, { type: 'error', message: VOICE_FALLBACK_MESSAGE });
  });

  deepgramSocket.on('close', (code) => {
    if (clientSocket.readyState === WebSocket.OPEN && code !== 1000) {
      safeSendJson(clientSocket, { type: 'error', message: VOICE_FALLBACK_MESSAGE });
      clientSocket.close();
    }
  });

  clientSocket.on('close', () => deepgramSocket.close());
  clientSocket.on('error', (err) => console.error('Client socket error:', err));
});

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
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: messages.map((message) => ({
            role: message.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: message.content }],
          })),
          generationConfig: { maxOutputTokens: 200, temperature: 0.6 },
        }),
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
