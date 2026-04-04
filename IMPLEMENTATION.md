# Spar — Full Implementation Guide
> AI-powered mock interview platform. Built in 7 hours. This document is your complete build spec.

---

## What You're Building

A web app where a candidate:
1. Picks a broken codebase scenario
2. Opens it in an in-browser code editor
3. Thinks out loud — their voice is transcribed live via Deepgram
4. An AI interviewer (Gemini) listens and fires follow-up questions in real time
5. They fix the bug in the editor
6. They get a report card

**One scenario. One loop. Nail it.**

---

## Stack

| Layer | Tool | Why |
|---|---|---|
| Frontend | React (Vite) | Fast setup, Monaco has a React package |
| Code editor | `@monaco-editor/react` | VS Code in the browser, zero config |
| Voice transcription | Deepgram Streaming API | Real-time WebSocket, words appear as you speak |
| AI Interviewer | Google Gemini API (`gemini-1.5-flash`) | Fast, free tier, good reasoning |
| Backend | Express.js | Only needed to proxy API keys safely |
| Styling | Plain CSS | No component library needed |

---

## Team Split — Work In Parallel

Three people, three lanes. These lanes are designed to be independent for the first 3 hours. You integrate at Hour 4.

---

### 👤 Person A — Frontend & UI
**You own:** Landing screen, Report card screen, overall app shell (App.jsx), routing between screens, visual polish, Timer component, Chat panel display layout.

**You do NOT touch:** Voice code, the server, Monaco internals, `useDeepgram.js`, `useInterviewer.js`.

**Your contract with the team:**
- `Interview.jsx` accepts `{ scenario, onFinish }` — stub this screen with mock data first, Person B fills the editor in
- `ChatPanel` display accepts `{ messages, isThinking }` as props — Person B's hook drops straight in
- `VoiceBar` layout slot exists in Interview — Person C's component drops straight in
- `Report.jsx` accepts `{ report, scenario }` — build this fully independently

**Hours 1–3:** Build Landing, Report, App.jsx router, Timer, chat message display using hardcoded mock data.
**Hours 4–5:** Integrate with Person B and C. Wire real props. Polish layout.
**Hours 6–7:** Demo prep, edge cases, visual fixes.

---

### 👤 Person B — Code Editor, Scenarios & Gemini AI
**You own:** Monaco editor setup, the scenario data file (`scenarios.js`), the `useInterviewer.js` Gemini hook, the `/api/chat` server route, behavior tracking logic for the report card.

**You do NOT touch:** Voice, Deepgram, Landing screen visuals, Report screen visuals.

**Your contract with the team:**
- Export `useInterviewer(scenario)` returning `{ messages, isThinking, sendMessage }` — Person C calls `sendMessage(transcript)` when voice finalizes
- Export `scenarios` array from `data/scenarios.js` — Person A uses this for the Landing screen picker
- The Monaco editor and file tabs live inside `Interview.jsx` — you build them, Person A places them in the layout

**Hours 1–3:** Write the full `scenarios.js` broken codebase. Set up Monaco. Wire Gemini `/api/chat` route on the server. Build `useInterviewer.js`.
**Hours 4–5:** Integrate editor into Interview screen with Person A. Test Gemini responses. Start tuning the system prompt.
**Hours 6–7:** Tune system prompt until AI sounds like a real engineer. Pre-cache fallback responses for demo safety.

---

### 👤 Person C — Voice Integration (Deepgram)
**You own:** Express server setup and running, Deepgram WebSocket proxy, `useDeepgram.js` hook, `VoiceBar` component (live transcript + mic button), typed text fallback input.

**You do NOT touch:** Monaco, scenarios, Gemini prompt, any screen layout except the VoiceBar strip.

**Your contract with the team:**
- Export `useDeepgram({ onFinalTranscript })` returning `{ isListening, liveTranscript, startListening, stopListening }` — Person B's `sendMessage` is what gets passed as `onFinalTranscript`
- Export `VoiceBar` component accepting `{ liveTranscript, isListening, onStart, onStop, onFinish }` — Person A places it in the Interview layout

**Hours 1–2:** Get server running. Get Deepgram WebSocket proxy working. **Test mic → transcript in a plain HTML file first**, not in React. Save yourself debugging time.
**Hours 2–4:** Build `useDeepgram.js`. Build VoiceBar. Confirm end-to-end voice loop works in isolation.
**Hours 4–5:** Integrate into Interview screen. Test the full loop: speak → transcript → Gemini → response.
**Hours 6–7:** Build typed text fallback in case mic fails on stage. Test on the exact demo machine.

---

## Hour-by-Hour Timeline

| Hour | Person A | Person B | Person C |
|---|---|---|---|
| 1 | Repo setup, Vite scaffold, App.jsx router stub | Repo setup, write `scenarios.js` | Repo setup, Express server running |
| 2 | Landing screen complete | Monaco editor working with scenario files | Deepgram WebSocket proxy working (test in plain HTML first) |
| 3 | Report screen + Timer complete | `useInterviewer.js` + Gemini `/api/chat` route done | `useDeepgram.js` done, VoiceBar built |
| 4 | **INTEGRATION** — wire all three together in `Interview.jsx` | Drop editor + behavior tracking into Interview | Drop VoiceBar into Interview, test full loop |
| 5 | Polish Interview layout, fix anything broken | Tune Gemini system prompt aggressively | Build typed text fallback input |
| 6 | Visual polish, run full demo | Pre-cache fallback AI responses | Test mic on demo machine |
| 7 | **FULL DEMO RUN × 3** | **FULL DEMO RUN × 3** | **FULL DEMO RUN × 3** |

---

## First Thing — Repo Setup (All Three Together, Hour 1, 15 Minutes)

One person creates the repo. Everyone clones. Do this before splitting.

```bash
# Create project
npm create vite@latest spar-client -- --template react
cd spar-client
npm install
npm install @monaco-editor/react

# Create server
mkdir ../spar-server && cd ../spar-server
npm init -y
npm install express cors dotenv ws
```

**`spar-server/.env`** — Person C creates this, shares keys privately
```
DEEPGRAM_API_KEY=your_deepgram_key_here
GEMINI_API_KEY=your_gemini_key_here
PORT=3001
```

**`.env.example`** — commit this, not the real `.env`
```
DEEPGRAM_API_KEY=
GEMINI_API_KEY=
PORT=3001
```

**Agree on these interfaces before splitting.** This is the contract between the three lanes:

```javascript
// Person C builds — Person B consumes via onFinalTranscript
const { isListening, liveTranscript, startListening, stopListening } = useDeepgram({ onFinalTranscript })

// Person B builds — Person A and C consume
const { messages, isThinking, sendMessage } = useInterviewer(scenario)

// Person B builds — Person A consumes
export const scenarios = [{ id, title, description, difficulty, timeLimit, files, bugExplanation, fixSummary }]
```

Once everyone agrees, split and go.

---

## PERSON B — Scenario Data

Write this before anything else. This is the actual product.

**`client/src/data/scenarios.js`**

```javascript
export const scenarios = [
  {
    id: "duplicate-orders",
    title: "Checkout Bug",
    company: "E-commerce Platform",
    description: "Orders are duplicating in production. Customers are being charged twice.",
    difficulty: "Mid-level",
    timeLimit: 40 * 60,
    files: {
      "routes/orders.js": `const express = require('express');
const router = express.Router();
const db = require('../db');

// POST /api/orders
router.post('/', async (req, res) => {
  const { userId, items, total } = req.body;

  try {
    const user = await db.users.findOne({ id: userId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const order = await db.orders.create({
      userId, items, total,
      status: 'pending',
      createdAt: new Date()
    });

    const payment = await processPayment(user, total);
    await db.orders.update(order.id, { status: 'confirmed' });

    res.json({ success: true, orderId: order.id });

  } catch (err) {
    // If payment fails, retry once
    console.error('Order failed, retrying...', err);
    const order = await db.orders.create({
      userId, items, total,
      status: 'pending',
      createdAt: new Date()
    });
    await processPayment(user, total);
    await db.orders.update(order.id, { status: 'confirmed' });
    res.json({ success: true, orderId: order.id });
  }
});

async function processPayment(user, total) {
  return await paymentGateway.charge(user.paymentMethod, total);
}

module.exports = router;`,

      "db/index.js": `// Database abstraction layer
const orders = {
  async create(data) {
    return await pool.query(
      'INSERT INTO orders (user_id, items, total, status, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [data.userId, JSON.stringify(data.items), data.total, data.status, data.createdAt]
    );
  },
  async findOne(query) {
    const keys = Object.keys(query);
    const where = keys.map((k, i) => \`\${k} = $\${i + 1}\`).join(' AND ');
    return await pool.query(\`SELECT * FROM orders WHERE \${where} LIMIT 1\`, Object.values(query));
  },
  async update(id, data) {
    const keys = Object.keys(data);
    const set = keys.map((k, i) => \`\${k} = $\${i + 2}\`).join(', ');
    return await pool.query(\`UPDATE orders SET \${set} WHERE id = $1\`, [id, ...Object.values(data)]);
  }
};

module.exports = { orders, users };`,

      "middleware/auth.js": `const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};`,
    },
    bugLocation: "routes/orders.js",
    bugLine: 28,
    bugExplanation: "The catch block silently creates a second order and retries payment instead of returning an error. Any network hiccup on the payment call creates a duplicate order and charges the customer twice.",
    fixSummary: "Remove the retry logic from the catch block. Return an error to the client instead. Add idempotency key checking at the top of the handler.",
  }
];
```

---

## PERSON B — Gemini Hook

**`client/src/hooks/useInterviewer.js`**

```javascript
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
```

---

## PERSON C — Express Server

**`spar-server/index.js`**

```javascript
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

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    res.json({ reply: text || null });

  } catch (err) {
    console.error('Gemini error:', err);
    res.status(500).json({ error: 'AI unavailable' });
  }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Spar server running on :${PORT}`));
```

---

## PERSON C — Deepgram Hook

**Test this in a plain HTML file before touching React.** Open `test-voice.html` in Chrome, confirm transcript appears, then port to React.

**`client/src/hooks/useDeepgram.js`**

```javascript
import { useState, useRef, useCallback } from 'react';

export function useDeepgram({ onFinalTranscript }) {
  const [isListening, setIsListening] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const socketRef = useRef(null);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);

  const startListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const socket = new WebSocket('ws://localhost:3001/deepgram');
      socketRef.current = socket;

      socket.onopen = () => {
        const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        recorderRef.current = recorder;

        recorder.ondataavailable = (e) => {
          if (socket.readyState === WebSocket.OPEN && e.data.size > 0) {
            socket.send(e.data);
          }
        };

        recorder.start(250);
        setIsListening(true);
      };

      socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        const transcript = data.channel?.alternatives?.[0]?.transcript;
        const isFinal = data.is_final;

        if (transcript) {
          setLiveTranscript(transcript);
          if (isFinal && transcript.trim().length > 0) {
            onFinalTranscript(transcript); // fires Person B's sendMessage
            setLiveTranscript('');
          }
        }
      };

      socket.onerror = (err) => console.error('WebSocket error:', err);

    } catch (err) {
      console.error('Mic access denied:', err);
      alert('Please allow microphone access to use Spar.');
    }
  }, [onFinalTranscript]);

  const stopListening = useCallback(() => {
    recorderRef.current?.stop();
    socketRef.current?.close();
    streamRef.current?.getTracks().forEach(t => t.stop());
    setIsListening(false);
    setLiveTranscript('');
  }, []);

  return { isListening, liveTranscript, startListening, stopListening };
}
```

---

## PERSON C — VoiceBar Component

Person A places this in the Interview layout. You just build and export it.

**`client/src/components/VoiceBar.jsx`**

```jsx
export default function VoiceBar({ liveTranscript, isListening, onStart, onStop, onFinish }) {
  return (
    <div style={{ padding: 16, borderTop: '1px solid #222', background: '#111' }}>

      {liveTranscript && (
        <div style={{
          marginBottom: 12, padding: '8px 14px',
          background: '#1a1a22', borderRadius: 8,
          fontSize: 13, color: '#888', fontStyle: 'italic',
          border: '1px solid #2a2a35'
        }}>
          "{liveTranscript}"
        </div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={isListening ? onStop : onStart}
          style={{
            flex: 1, padding: '12px 0',
            background: isListening ? '#3ddc84' : '#ff5c35',
            color: '#fff', border: 'none', borderRadius: 8,
            fontWeight: 700, fontSize: 14, cursor: 'pointer',
            transition: 'background 0.15s',
          }}
        >
          {isListening ? '⏹ Stop talking' : '🎙 Start talking'}
        </button>

        <button
          onClick={onFinish}
          style={{
            padding: '12px 20px', background: 'transparent',
            color: '#555', border: '1px solid #333', borderRadius: 8,
            fontSize: 14, cursor: 'pointer', fontFamily: 'sans-serif'
          }}
        >
          I'm done
        </button>
      </div>

      <div style={{ marginTop: 10, fontSize: 12, color: isListening ? '#3ddc84' : '#333', textAlign: 'center' }}>
        {isListening ? '● Recording — speak naturally' : 'Press the button and think out loud'}
      </div>
    </div>
  );
}
```

---

## PERSON A — App Router

**`client/src/App.jsx`**

```jsx
import { useState } from 'react';
import Landing from './screens/Landing';
import Interview from './screens/Interview';
import Report from './screens/Report';
import { scenarios } from './data/scenarios';

export default function App() {
  const [screen, setScreen] = useState('landing');
  const [selectedScenario, setSelectedScenario] = useState(scenarios[0]);
  const [report, setReport] = useState(null);

  if (screen === 'landing') {
    return (
      <Landing
        scenarios={scenarios}
        onStart={(scenario) => { setSelectedScenario(scenario); setScreen('interview'); }}
      />
    );
  }

  if (screen === 'interview') {
    return (
      <Interview
        scenario={selectedScenario}
        onFinish={(reportData) => { setReport(reportData); setScreen('report'); }}
      />
    );
  }

  if (screen === 'report') {
    return <Report report={report} scenario={selectedScenario} onRetry={() => setScreen('landing')} />;
  }
}
```

---

## PERSON A — Landing Screen

**`client/src/screens/Landing.jsx`**

```jsx
import { useState } from 'react';

export default function Landing({ scenarios, onStart }) {
  const [selected, setSelected] = useState(scenarios[0]);

  return (
    <div style={{
      minHeight: '100vh', background: '#0a0a0b', color: '#f0f0f0',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', fontFamily: 'sans-serif', padding: 40, textAlign: 'center'
    }}>
      <div style={{ fontSize: 11, color: '#ff5c35', fontWeight: 700, letterSpacing: '0.25em', marginBottom: 32 }}>
        ▲ SPAR
      </div>

      <h1 style={{ fontSize: 'clamp(2rem, 5vw, 4rem)', fontWeight: 800, lineHeight: 1.05, marginBottom: 16, letterSpacing: '-0.02em' }}>
        The interview changed.<br />
        <span style={{ color: '#ff5c35' }}>The prep didn't.</span>
      </h1>

      <p style={{ color: '#555', fontSize: 17, maxWidth: 480, lineHeight: 1.6, marginBottom: 48 }}>
        Real codebases. Real bugs. An AI interviewer that pushes back. This is how hiring works in 2026.
      </p>

      <div style={{ display: 'flex', marginBottom: 48, fontSize: 12, fontWeight: 700, letterSpacing: '0.1em' }}>
        {['1970 — Whiteboard', '2015 — LeetCode', '2026 — Spar'].map((item, i) => (
          <div key={item} style={{
            padding: '10px 18px', border: '0.5px solid',
            borderColor: i === 2 ? '#ff5c35' : '#222',
            background: i === 2 ? '#ff5c35' : 'transparent',
            color: i === 2 ? '#fff' : i === 1 ? '#555' : '#333',
            borderRadius: i === 0 ? '6px 0 0 6px' : i === 2 ? '0 6px 6px 0' : 0,
          }}>
            {item}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 40, flexWrap: 'wrap', justifyContent: 'center' }}>
        {scenarios.map(s => (
          <button key={s.id} onClick={() => setSelected(s)} style={{
            padding: '10px 20px', borderRadius: 100,
            border: `1px solid ${selected.id === s.id ? '#ff5c35' : '#222'}`,
            background: selected.id === s.id ? 'rgba(255,92,53,0.1)' : 'transparent',
            color: selected.id === s.id ? '#ff5c35' : '#555',
            cursor: 'pointer', fontFamily: 'sans-serif', fontSize: 14,
          }}>
            {s.title}
          </button>
        ))}
      </div>

      <button onClick={() => onStart(selected)} style={{
        background: '#ff5c35', color: '#fff', border: 'none',
        padding: '16px 52px', borderRadius: 10,
        fontSize: 16, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.05em',
      }}>
        Start Interview →
      </button>

      <p style={{ marginTop: 20, fontSize: 13, color: '#333' }}>
        Microphone required · {selected.timeLimit / 60} minutes · {selected.difficulty}
      </p>
    </div>
  );
}
```

---

## PERSON A — Timer Component

**`client/src/components/Timer.jsx`**

```jsx
import { useState, useEffect } from 'react';

export default function Timer({ seconds, onExpire }) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    if (remaining <= 0) { onExpire(); return; }
    const interval = setInterval(() => setRemaining(r => r - 1), 1000);
    return () => clearInterval(interval);
  }, [remaining, onExpire]);

  const mins = Math.floor(remaining / 60).toString().padStart(2, '0');
  const secs = (remaining % 60).toString().padStart(2, '0');
  const isUrgent = remaining < 5 * 60;

  return (
    <div style={{
      fontFamily: 'monospace', fontSize: 18, fontWeight: 600,
      color: isUrgent ? '#ff5c35' : '#f5a623',
      background: isUrgent ? 'rgba(255,92,53,0.1)' : 'rgba(245,166,35,0.1)',
      padding: '6px 14px', borderRadius: 6,
    }}>
      {mins}:{secs}
    </div>
  );
}
```

---

## PERSON A — Report Screen

Build this fully independently. Only needs `report` and `scenario` as props.

**`client/src/screens/Report.jsx`**

```jsx
export default function Report({ report, scenario, onRetry }) {
  const scores = generateScores(report);

  return (
    <div style={{
      minHeight: '100vh', background: '#0a0a0b', color: '#f0f0f0',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'sans-serif', padding: 40,
    }}>
      <div style={{ maxWidth: 640, width: '100%' }}>
        <div style={{ fontSize: 12, color: '#ff5c35', fontWeight: 700, letterSpacing: '0.2em', marginBottom: 8 }}>
          SPAR — SESSION COMPLETE
        </div>
        <h1 style={{ fontSize: 36, fontWeight: 800, marginBottom: 8 }}>Your Report</h1>
        <p style={{ color: '#555', marginBottom: 40 }}>
          {scenario.title} · {Math.floor(report.duration / 60)}m {report.duration % 60}s
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 40 }}>
          {scores.map(score => <ScoreRow key={score.label} {...score} />)}
        </div>

        <div style={{ background: '#111', border: '1px solid #222', borderRadius: 12, padding: 24, marginBottom: 32 }}>
          <div style={{ fontSize: 12, color: '#555', fontWeight: 700, letterSpacing: '0.15em', marginBottom: 12 }}>
            THE BUG
          </div>
          <p style={{ color: '#ccc', lineHeight: 1.6 }}>{scenario.bugExplanation}</p>
          <div style={{ marginTop: 16, fontSize: 13, color: '#ff5c35' }}>Fix: {scenario.fixSummary}</div>
        </div>

        <button onClick={onRetry} style={{
          background: 'transparent', color: '#555', border: '1px solid #333',
          padding: '12px 28px', borderRadius: 8, cursor: 'pointer',
          fontFamily: 'sans-serif', fontSize: 14,
        }}>
          ← Try again
        </button>
      </div>
    </div>
  );
}

function ScoreRow({ label, score, max, description, color }) {
  const pct = Math.round((score / max) * 100);
  return (
    <div style={{ background: '#111', border: '1px solid #222', borderRadius: 10, padding: '16px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 15 }}>{label}</span>
        <span style={{ color, fontWeight: 700 }}>{pct}%</span>
      </div>
      <div style={{ background: '#1e1e1e', borderRadius: 4, height: 6, marginBottom: 10 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4 }} />
      </div>
      <p style={{ fontSize: 13, color: '#666', margin: 0 }}>{description}</p>
    </div>
  );
}

function generateScores(report) {
  const readPct = report.timeToFirstEdit ? Math.min(report.timeToFirstEdit / 120, 1) : 0;
  const readScore = report.readBeforeEdit ? 5 : 2;

  return [
    {
      label: 'Code reading', score: Math.round(readPct * 5 + readScore), max: 10, color: '#3ddc84',
      description: report.readBeforeEdit
        ? `You spent time reading before editing — good signal. First edit at ${report.timeToFirstEdit}s.`
        : 'You jumped to editing quickly. Interviewers want to see you understand the codebase first.'
    },
    {
      label: 'Communication', score: Math.min(report.utteranceCount, 10), max: 10, color: '#5b9cf6',
      description: `You made ${report.utteranceCount} verbal statements. Strong candidates narrate every thought — including dead ends.`
    },
    {
      label: 'Exploration', score: Math.min(report.filesViewed, 4), max: 4, color: '#f5a623',
      description: `You opened ${report.filesViewed} file${report.filesViewed !== 1 ? 's' : ''}. Good debugging means tracing the full request path before assuming you know where the bug is.`
    },
    {
      label: 'Engagement', score: Math.min(report.aiMessagesReceived, 10), max: 10, color: '#ff5c35',
      description: `You responded to ${report.aiMessagesReceived} interviewer questions. The best candidates treat the interviewer as a collaborator, not an obstacle.`
    }
  ];
}
```

---

## Integration Point — Interview Screen (Hour 4, All Three Together)

This is where the three lanes merge. One person drives, others review. Don't skip the integration hour.

**`client/src/screens/Interview.jsx`**

```jsx
import { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { useDeepgram } from '../hooks/useDeepgram';       // Person C
import { useInterviewer } from '../hooks/useInterviewer';  // Person B
import VoiceBar from '../components/VoiceBar';             // Person C
import Timer from '../components/Timer';                   // Person A

export default function Interview({ scenario, onFinish }) {
  const [activeFile, setActiveFile] = useState(Object.keys(scenario.files)[0]);
  const [fileContents, setFileContents] = useState({ ...scenario.files });
  const chatEndRef = useRef(null);

  // Behavior tracking for the report card — Person B owns this logic
  const behaviorRef = useRef({
    readBeforeEdit: false,
    firstEditTime: null,
    startTime: Date.now(),
    utteranceCount: 0,
    aiMessagesReceived: 0,
    filesViewed: new Set(),
  });

  // Person B's hook
  const { messages, isThinking, sendMessage } = useInterviewer(scenario);

  // Wire Person C's voice output → Person B's AI input
  const handleFinalTranscript = (transcript) => {
    behaviorRef.current.utteranceCount++;
    sendMessage(transcript);
  };

  // Person C's hook
  const { isListening, liveTranscript, startListening, stopListening } = useDeepgram({
    onFinalTranscript: handleFinalTranscript
  });

  const handleFileSelect = (filename) => {
    setActiveFile(filename);
    behaviorRef.current.filesViewed.add(filename);
    if (!behaviorRef.current.firstEditTime) behaviorRef.current.readBeforeEdit = true;
  };

  const handleEditorChange = (value) => {
    if (!behaviorRef.current.firstEditTime) behaviorRef.current.firstEditTime = Date.now();
    setFileContents(prev => ({ ...prev, [activeFile]: value }));
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    behaviorRef.current.aiMessagesReceived = messages.filter(m => m.role === 'assistant').length;
  }, [messages]);

  const handleFinish = () => {
    const b = behaviorRef.current;
    onFinish({
      duration: Math.floor((Date.now() - b.startTime) / 1000),
      readBeforeEdit: b.readBeforeEdit,
      filesViewed: b.filesViewed.size,
      utteranceCount: b.utteranceCount,
      aiMessagesReceived: b.aiMessagesReceived,
      timeToFirstEdit: b.firstEditTime ? Math.floor((b.firstEditTime - b.startTime) / 1000) : null,
      conversationHistory: messages,
    });
  };

  // Hide the answer file from the candidate
  const visibleFiles = Object.keys(scenario.files).filter(f => !f.includes('.fixed.'));

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0a0a0b', color: '#f0f0f0', fontFamily: 'sans-serif' }}>

      {/* ── LEFT: Code Editor — Person B builds, Person A places ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid #222' }}>

        <div style={{ display: 'flex', background: '#111', borderBottom: '1px solid #222', overflowX: 'auto' }}>
          {visibleFiles.map(filename => (
            <button key={filename} onClick={() => handleFileSelect(filename)} style={{
              padding: '10px 20px', border: 'none', cursor: 'pointer',
              background: activeFile === filename ? '#1e1e1e' : 'transparent',
              color: activeFile === filename ? '#fff' : '#666',
              fontFamily: 'monospace', fontSize: 13,
              borderBottom: activeFile === filename ? '2px solid #ff5c35' : '2px solid transparent',
              whiteSpace: 'nowrap',
            }}>
              {filename.split('/').pop()}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }}>
          <Editor
            height="100%"
            language="javascript"
            theme="vs-dark"
            value={fileContents[activeFile]}
            onChange={handleEditorChange}
            options={{ fontSize: 14, minimap: { enabled: false }, lineNumbers: 'on', wordWrap: 'on', scrollBeyondLastLine: false, padding: { top: 16 } }}
          />
        </div>
      </div>

      {/* ── RIGHT: Interviewer panel — Person A layout ── */}
      <div style={{ width: 380, display: 'flex', flexDirection: 'column', background: '#111' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #222', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#ff5c35', letterSpacing: '0.1em' }}>SPAR</div>
            <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>{scenario.title}</div>
          </div>
          <Timer seconds={scenario.timeLimit} onExpire={handleFinish} />
        </div>

        {/* Chat messages — Person B data, Person A layout */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {messages.map((msg, i) => (
            <div key={i} style={{
              alignSelf: msg.role === 'assistant' ? 'flex-start' : 'flex-end',
              maxWidth: '85%', padding: '10px 14px',
              borderRadius: msg.role === 'assistant' ? '4px 12px 12px 12px' : '12px 4px 12px 12px',
              background: msg.role === 'assistant' ? '#1e1e26' : '#ff5c35',
              color: '#f0f0f0', fontSize: 14, lineHeight: 1.5,
            }}>
              {msg.content}
            </div>
          ))}
          {isThinking && (
            <div style={{ alignSelf: 'flex-start', color: '#555', fontSize: 13, fontStyle: 'italic' }}>
              thinking...
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Voice bar — Person C component, Person A places it here */}
        <VoiceBar
          liveTranscript={liveTranscript}
          isListening={isListening}
          onStart={startListening}
          onStop={stopListening}
          onFinish={handleFinish}
        />
      </div>
    </div>
  );
}
```

---

## Running It

```bash
# Terminal 1 — Person C starts the server
cd spar-server
node index.js

# Terminal 2 — Person A starts the client
cd spar-client
npm run dev
```

Open `http://localhost:5173`

---

## Pre-Hackathon Checklist (Do Tonight)

- [ ] **Everyone:** Set up the repo, confirm it runs, agree on interfaces
- [ ] **Person B:** Write `scenarios.js` with the full broken codebase — do this tonight, it is the product
- [ ] **Person C:** Get Deepgram API key at deepgram.com (free, 5 minutes)
- [ ] **Person B:** Get Gemini API key at aistudio.google.com (free)
- [ ] **Person C:** Test mic access in Chrome on the machine you'll demo on
- [ ] **Everyone:** Confirm you can all run `npm run dev` and the server simultaneously

---

## Risk Mitigation

| Risk | Owner | Mitigation |
|---|---|---|
| Deepgram WebSocket fails on stage | Person C | Add a typed text input as fallback — same `sendMessage` call, different input method |
| Gemini slow or rate limited | Person B | Pre-cached `FALLBACKS` array in `useInterviewer.js` already handles this |
| Monaco doesn't load | Person B | Fallback to a plain `<textarea>` — ugly but functional |
| Mic permissions blocked on stage | Person C | Test on the exact machine and browser used for the demo |
| Integration breaks at Hour 4 | Everyone | Keep stub/mock data in Interview.jsx until both hooks are confirmed working |

---

## The Demo Script (Rehearse This 3 Times)

1. Open Spar. Show landing. Say: *"Whiteboard interview, 1970. LeetCode, 2015. This is 2026."*
2. Click Start. Show the editor. Say: *"Real code. Real bug. No hints."*
3. Click Speak. Say out loud: *"I'm going to trace the request through the order route first..."*
4. Words appear live on screen.
5. AI fires back: *"What made you start there instead of the database layer?"*
6. Respond out loud. Find the bug. Fix it in the editor.
7. Click Done. Report card appears.
8. Say: *"This is what every interview prep platform should have built ten years ago."*

**Total: 3 minutes. That's all you need.**

---

## What Judges Will Remember

Not the code. The moment someone speaks, words appear in real time, and the AI fires back a question instantly. That 10-second loop — live on stage — is what wins. Everything else is in service of it.

Build the loop. Nail the demo. Ship it.
