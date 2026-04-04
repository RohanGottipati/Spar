require('dotenv').config();
const crypto = require('crypto');
const path = require('path');
const express = require('express');
const cors = require('cors');
const { createServer } = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const { ensureAssistants, getAssistantSpecs } = require('./lib/assistants');
const {
  addMessage,
  createThread,
  extractContent,
  getBackboardConfig,
  isBackboardConfigured,
} = require('./lib/backboard');
const {
  buildScenarioAnswerKey,
  getScenarioById,
  getVisibleFiles,
} = require('./lib/scenarios');
const {
  buildAnalyzerPrompt,
  buildFallbackReport,
  buildReportDossier,
  buildSynthesizerPrompt,
  sanitizeAnalyzerOutput,
  sanitizeFinalReport,
} = require('./lib/reporting');

const app = express();
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const VOICE_FALLBACK_MESSAGE = 'Voice is unavailable right now. Use the text fallback.';
const INTERVIEW_UNAVAILABLE_MESSAGE = 'Interview service unavailable';
const REPORT_UNAVAILABLE_MESSAGE = 'Report generation unavailable';
const DEEPGRAM_LISTEN_WS_URL = 'wss://api.deepgram.com/v1/listen?model=nova-2&language=en&smart_format=true&interim_results=true';
const DEEPGRAM_AGENT_WS_URL = 'wss://agent.deepgram.com/v1/agent/converse';
const VOICE_AGENT_THINK_MODEL = process.env.DEEPGRAM_AGENT_THINK_MODEL || 'gpt-5.4-mini';
const VOICE_AGENT_THINK_REASONING_MODE = process.env.DEEPGRAM_AGENT_THINK_REASONING_MODE || 'medium';
const VOICE_AGENT_THINK_TEMPERATURE = process.env.DEEPGRAM_AGENT_THINK_TEMPERATURE;
const VOICE_AGENT_LISTEN_MODEL = process.env.DEEPGRAM_AGENT_LISTEN_MODEL || 'nova-3';
const VOICE_AGENT_LISTEN_VERSION = process.env.DEEPGRAM_AGENT_LISTEN_VERSION || 'v1';
const VOICE_AGENT_LISTEN_LANGUAGE = process.env.DEEPGRAM_AGENT_LISTEN_LANGUAGE || 'en';
const VOICE_AGENT_SPEAK_MODEL = process.env.DEEPGRAM_AGENT_SPEAK_MODEL || 'aura-2-jupiter-en';
const VOICE_AGENT_INIT_TIMEOUT_MS = 15_000;
const VOICE_AGENT_TURN_TIMEOUT_MS = 45_000;
const VOICE_AGENT_KEEP_ALIVE_MS = 5_000;
const VOICE_AGENT_INPUT_SAMPLE_RATE = 16_000;
const VOICE_AGENT_OUTPUT_SAMPLE_RATE = 24_000;
const VOICE_AGENT_OUTPUT_BITS_PER_SAMPLE = 16;
const VOICE_AGENT_OUTPUT_CHANNELS = 1;
const LIVE_INTERVIEW_WS_PATH = '/api/interview/live';
const LIVE_INTERVIEW_EVENTS = new Set([
  'ConversationText',
  'UserStartedSpeaking',
  'AgentThinking',
  'AgentStartedSpeaking',
  'AgentAudioDone',
  'InjectionRefused',
  'Error',
  'Warning',
]);
const activeSessions = new Map();

app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const server = createServer(app);

function safeSendJson(socket, payload) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function normalizeWebSocketMessage(data, isBinary = false) {
  if (isBinary) {
    return data;
  }

  if (typeof data === 'string') {
    return data;
  }

  if (Buffer.isBuffer(data)) {
    return data.toString('utf8');
  }

  return data;
}

function createId(prefix) {
  if (typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function buildOpeningMessage(scenario) {
  return `Let's start. You're debugging this issue: ${scenario.description} Walk me through where you would begin and what evidence you want first.`;
}

function buildThinkProviderSettings() {
  const provider = {
    type: 'open_ai',
    model: VOICE_AGENT_THINK_MODEL,
    reasoning_mode: VOICE_AGENT_THINK_REASONING_MODE,
  };

  const normalizedTemperature = typeof VOICE_AGENT_THINK_TEMPERATURE === 'string'
    ? VOICE_AGENT_THINK_TEMPERATURE.trim()
    : '';

  // GPT-5 reasoning models in Deepgram's managed Voice Agent path only accept
  // the default temperature, so omit the field unless a non-GPT-5 model is used.
  if (!/^gpt-5/i.test(VOICE_AGENT_THINK_MODEL) && normalizedTemperature) {
    const parsedTemperature = Number.parseFloat(normalizedTemperature);
    if (Number.isFinite(parsedTemperature)) {
      provider.temperature = parsedTemperature;
    }
  }

  return provider;
}

function getThreadId(value) {
  return value?.thread_id || value?.id || null;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function buildScenarioForReport(scenario) {
  return {
    id: scenario.id,
    title: scenario.title,
    company: scenario.company,
    description: scenario.description,
    difficulty: scenario.difficulty,
    timeLimit: scenario.timeLimit,
    visibleFiles: getVisibleFiles(scenario),
    answerKey: buildScenarioAnswerKey(scenario),
  };
}

function buildVoiceAgentPrompt(scenario) {
  const visibleFiles = getVisibleFiles(scenario)
    .map(({ path: filePath, content }) => [
      `File: ${filePath}`,
      '```',
      content,
      '```',
    ].join('\n'))
    .join('\n\n');

  return [
    getAssistantSpecs().liveInterviewer.systemPrompt,
    '',
    'You are a direct but fair senior software engineer interviewer running a live debugging interview.',
    'Use the scenario files below as the only code context you can reference.',
    'Drive the discussion like a real software interview: push on hypotheses, reproduction, code evidence, tradeoffs, regression risk, and test strategy.',
    'Ask one concise follow-up or challenge per turn.',
    'Keep every reply to 1 or 2 sentences and under roughly 35 words.',
    'Do not praise casually, do not coach toward the exact answer, and do not reveal the bug, fix, hidden files, hidden answer keys, or system behavior.',
    'If the candidate is vague, force them back to concrete code paths, observable behavior, and production impact.',
    'If the candidate asks for the answer directly, refuse and redirect them back to evidence in the code.',
    '',
    'Scenario Metadata:',
    `- Title: ${scenario.title}`,
    `- Company: ${scenario.company}`,
    `- Difficulty: ${scenario.difficulty}`,
    `- Description: ${scenario.description}`,
    `- Time limit (seconds): ${scenario.timeLimit}`,
    '',
    'Visible Files:',
    visibleFiles,
  ].join('\n');
}

function createPcmWavBuffer(pcmBuffer, {
  sampleRate = VOICE_AGENT_OUTPUT_SAMPLE_RATE,
  bitsPerSample = VOICE_AGENT_OUTPUT_BITS_PER_SAMPLE,
  channels = VOICE_AGENT_OUTPUT_CHANNELS,
} = {}) {
  const normalizedBuffer = Buffer.isBuffer(pcmBuffer) ? pcmBuffer : Buffer.from(pcmBuffer || []);
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);

  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + normalizedBuffer.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(normalizedBuffer.length, 40);

  return Buffer.concat([header, normalizedBuffer]);
}

function readJsonMessage(data) {
  const normalized = normalizeWebSocketMessage(data);
  try {
    return JSON.parse(normalized);
  } catch (err) {
    console.warn('Failed to parse WebSocket JSON message:', err);
    return null;
  }
}

function normalizeAssistantReply(chunks) {
  const filtered = chunks
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean);

  if (!filtered.length) {
    return '';
  }

  return filtered
    .filter((chunk, index) => filtered[index - 1] !== chunk)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanupSession(session, {
  closeSocket = true,
  rejectPending = true,
  removeFromRegistry = true,
} = {}) {
  if (!session || session.isClosed) {
    return;
  }

  session.isClosed = true;
  if (session.keepAliveTimer) {
    clearInterval(session.keepAliveTimer);
    session.keepAliveTimer = null;
  }

  if (rejectPending && session.pendingTurn) {
    clearTimeout(session.pendingTurn.timeoutId);
    session.pendingTurn.reject(new Error('Interview session closed'));
    session.pendingTurn = null;
  }

  if (removeFromRegistry) {
    activeSessions.delete(session.sessionId);
  }

  if (closeSocket && session.socket && (
    session.socket.readyState === WebSocket.OPEN
    || session.socket.readyState === WebSocket.CONNECTING
  )) {
    try {
      session.socket.close(1000, 'session_closed');
    } catch (err) {
      console.error('Failed to close voice agent socket:', err);
    }
  }
}

function settlePendingTurn(session, error = null) {
  if (!session?.pendingTurn) {
    return;
  }

  const pendingTurn = session.pendingTurn;
  session.pendingTurn = null;
  clearTimeout(pendingTurn.timeoutId);

  if (error) {
    pendingTurn.reject(error);
    return;
  }

  const reply = normalizeAssistantReply(pendingTurn.assistantChunks);
  const audioBuffer = pendingTurn.audioChunks.length
    ? createPcmWavBuffer(Buffer.concat(pendingTurn.audioChunks))
    : null;

  if (!reply) {
    pendingTurn.reject(new Error('Voice agent reply was empty'));
    return;
  }

  pendingTurn.resolve({
    reply,
    audioBase64: audioBuffer ? audioBuffer.toString('base64') : null,
    audioMimeType: audioBuffer ? 'audio/wav' : null,
  });
}

function handleVoiceAgentEvent(session, payload, isBinary = false) {
  if (!session || session.isClosed) {
    return;
  }

  if (isBinary) {
    if (session.pendingTurn) {
      session.pendingTurn.audioChunks.push(Buffer.isBuffer(payload) ? payload : Buffer.from(payload));
    }

    return;
  }

  if (!payload || typeof payload !== 'object') {
    return;
  }

  if (payload.type === 'ConversationText' && payload.role === 'assistant' && session.pendingTurn) {
    if (typeof payload.content === 'string' && payload.content.trim()) {
      session.pendingTurn.assistantChunks.push(payload.content.trim());
    }
    return;
  }

  if (payload.type === 'AgentAudioDone') {
    settlePendingTurn(session);
    return;
  }

  if (payload.type === 'InjectionRefused') {
    settlePendingTurn(session, new Error('Voice agent refused the new message because another response was still in progress'));
    return;
  }

  if (payload.type === 'Error') {
    const message = payload.message || payload.description || 'Voice agent request failed';
    settlePendingTurn(session, new Error(message));
    return;
  }

  if (payload.type === 'Warning') {
    console.warn('Voice agent warning:', payload);
  }
}

function forwardVoiceAgentEventToClient(session, payload, isBinary = false) {
  if (!session?.clientSocket || session.clientSocket.readyState !== WebSocket.OPEN) {
    return;
  }

  if (isBinary) {
    session.clientSocket.send(Buffer.isBuffer(payload) ? payload : Buffer.from(payload), { binary: true });
    return;
  }

  if (payload && LIVE_INTERVIEW_EVENTS.has(payload.type)) {
    safeSendJson(session.clientSocket, payload);
  }
}

function logVoiceAgentEvent(session, payload) {
  if (!session || !payload || typeof payload.type !== 'string') {
    return;
  }

  if (
    payload.type === 'SettingsApplied'
    || payload.type === 'UserStartedSpeaking'
    || payload.type === 'AgentThinking'
    || payload.type === 'AgentStartedSpeaking'
    || payload.type === 'AgentAudioDone'
    || payload.type === 'InjectionRefused'
    || payload.type === 'Error'
  ) {
    console.log(`Voice agent event [${session.sessionId}] ${payload.type}`);
  }
}

function createVoiceAgentSettings(scenario, openingMessage) {
  return {
    type: 'Settings',
    tags: [`scenario:${scenario.id}`],
    flags: {
      history: true,
    },
    audio: {
      input: {
        encoding: 'linear16',
        sample_rate: VOICE_AGENT_INPUT_SAMPLE_RATE,
      },
      output: {
        encoding: 'linear16',
        sample_rate: VOICE_AGENT_OUTPUT_SAMPLE_RATE,
        container: 'none',
      },
    },
    agent: {
      listen: {
        provider: {
          type: 'deepgram',
          model: VOICE_AGENT_LISTEN_MODEL,
          version: VOICE_AGENT_LISTEN_VERSION,
          language: VOICE_AGENT_LISTEN_LANGUAGE,
          smart_format: true,
        },
      },
      think: {
        provider: buildThinkProviderSettings(),
        prompt: buildVoiceAgentPrompt(scenario),
      },
      speak: {
        provider: {
          type: 'deepgram',
          model: VOICE_AGENT_SPEAK_MODEL,
        },
      },
      greeting: openingMessage,
    },
  };
}

function createVoiceAgentSession({ sessionId, scenario, openingMessage, clientSocket = null }) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(DEEPGRAM_AGENT_WS_URL, {
      headers: {
        Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
      },
    });

    const session = {
      sessionId,
      scenarioId: scenario.id,
      createdAt: Date.now(),
      openingMessage,
      socket,
      clientSocket,
      keepAliveTimer: null,
      pendingTurn: null,
      isClosed: false,
      isReady: false,
    };

    let initComplete = false;
    const initTimeoutId = setTimeout(() => {
      if (initComplete) {
        return;
      }

      initComplete = true;
      cleanupSession(session);
      reject(new Error('Voice agent initialization timed out'));
    }, VOICE_AGENT_INIT_TIMEOUT_MS);

    const finalizeInit = (error = null) => {
      if (initComplete) {
        return;
      }

      initComplete = true;
      clearTimeout(initTimeoutId);

      if (error) {
        cleanupSession(session);
        reject(error);
        return;
      }

      session.keepAliveTimer = setInterval(() => {
        if (session.socket.readyState === WebSocket.OPEN) {
          session.socket.send(JSON.stringify({ type: 'KeepAlive' }));
        }
      }, VOICE_AGENT_KEEP_ALIVE_MS);

      resolve(session);
    };

    socket.on('message', (data, isBinary) => {
      if (isBinary) {
        handleVoiceAgentEvent(session, data, true);
        forwardVoiceAgentEventToClient(session, data, true);
        return;
      }

      const payload = readJsonMessage(data);
      if (!payload) {
        return;
      }

      if (!session.isReady) {
        if (payload.type === 'Welcome') {
          socket.send(JSON.stringify(createVoiceAgentSettings(scenario, openingMessage)));
          return;
        }

        if (payload.type === 'SettingsApplied') {
          logVoiceAgentEvent(session, payload);
          session.isReady = true;
          finalizeInit();
          return;
        }

        if (payload.type === 'Error') {
          finalizeInit(new Error(payload.message || payload.description || 'Voice agent initialization failed'));
          return;
        }
      }

      logVoiceAgentEvent(session, payload);
      handleVoiceAgentEvent(session, payload);
      forwardVoiceAgentEventToClient(session, payload);
    });

    socket.on('error', (err) => {
      console.error('Voice agent socket error:', err);
      if (session.isClosed) {
        return;
      }

      if (!session.isReady) {
        finalizeInit(err);
        return;
      }

      safeSendJson(session.clientSocket, {
        type: 'Error',
        message: 'The live interviewer connection failed.',
      });
    });

    socket.on('close', () => {
      if (session.isClosed) {
        return;
      }

      if (!session.isReady) {
        finalizeInit(new Error('Voice agent connection closed before it was ready'));
        return;
      }

      safeSendJson(session.clientSocket, {
        type: 'Error',
        message: 'The live interviewer connection closed.',
      });
      cleanupSession(session, { closeSocket: false });
    });
  });
}

function sendVoiceAgentMessage(session, content) {
  return new Promise((resolve, reject) => {
    if (!session || session.isClosed || !session.isReady) {
      reject(new Error('Voice agent session is unavailable'));
      return;
    }

    if (session.pendingTurn) {
      reject(new Error('Voice agent is still responding to the previous message'));
      return;
    }

    if (session.socket.readyState !== WebSocket.OPEN) {
      reject(new Error('Voice agent connection is not open'));
      return;
    }

    session.pendingTurn = {
      resolve,
      reject,
      assistantChunks: [],
      audioChunks: [],
      timeoutId: setTimeout(() => {
        settlePendingTurn(session, new Error('Voice agent response timed out'));
      }, VOICE_AGENT_TURN_TIMEOUT_MS),
    };

    session.socket.send(JSON.stringify({
      type: 'InjectUserMessage',
      content,
    }));
  });
}

async function runAssistantThread({ assistantId, content, provider, model, metadata }) {
  const thread = await createThread(assistantId);
  const threadId = getThreadId(thread);

  if (!threadId) {
    throw new Error('Backboard thread creation did not return a thread ID');
  }

  const response = await addMessage(threadId, {
    content,
    llm_provider: provider,
    model_name: model,
    stream: false,
    memory: 'off',
    web_search: 'off',
    metadata,
  });

  const reply = extractContent(response);
  if (!reply) {
    throw new Error('Backboard assistant response was empty');
  }

  return reply;
}

function getReportAgentMappings(assistantIds) {
  return [
    ['code_behavior', assistantIds.codeBehavior],
    ['communication_quality', assistantIds.communicationQuality],
    ['interviewer_dynamic', assistantIds.interviewerDynamic],
    ['bug_fix_quality', assistantIds.bugFixQuality],
  ];
}

app.get('/health', (_req, res) => {
  const backboard = getBackboardConfig();

  res.json({
    ok: true,
    deepgramConfigured: Boolean(process.env.DEEPGRAM_API_KEY),
    interviewConfigured: Boolean(process.env.DEEPGRAM_API_KEY),
    backboardConfigured: isBackboardConfigured(),
    backboardBaseUrl: backboard.baseUrl,
    backboardLiveProvider: backboard.liveProvider,
    backboardLiveModel: backboard.liveModel,
    backboardReportProvider: backboard.reportProvider,
    backboardReportModel: backboard.reportModel,
    activeSessionCount: activeSessions.size,
  });
});

const liveInterviewWss = new WebSocketServer({ noServer: true });

liveInterviewWss.on('connection', (clientSocket) => {
  console.log('Client connected to live interview bridge');

  let session = null;
  let isStarting = false;

  const cleanupLiveSession = () => {
    if (session) {
      cleanupSession(session);
      session = null;
    }
  };

  clientSocket.on('message', async (data, isBinary) => {
    if (isBinary) {
      if (!session || session.isClosed || !session.isReady || session.socket.readyState !== WebSocket.OPEN) {
        return;
      }

      session.socket.send(data, { binary: true });
      return;
    }

    const payload = readJsonMessage(data);
    if (!payload) {
      safeSendJson(clientSocket, { type: 'Error', message: 'Invalid live interview payload.' });
      return;
    }

    if (payload.type === 'StartSession') {
      if (isStarting || session) {
        safeSendJson(clientSocket, { type: 'Error', message: 'Interview session is already active.' });
        return;
      }

      if (!process.env.DEEPGRAM_API_KEY) {
        safeSendJson(clientSocket, { type: 'Error', message: INTERVIEW_UNAVAILABLE_MESSAGE });
        return;
      }

      if (!isNonEmptyString(payload.scenarioId)) {
        safeSendJson(clientSocket, { type: 'Error', message: 'Scenario ID is required.' });
        return;
      }

      isStarting = true;

      try {
        const scenario = await getScenarioById(payload.scenarioId.trim());
        if (!scenario) {
          safeSendJson(clientSocket, { type: 'Error', message: 'Scenario not found.' });
          return;
        }

        const sessionId = createId('live_session');
        const openingMessage = buildOpeningMessage(scenario);
        const nextSession = await createVoiceAgentSession({
          sessionId,
          scenario,
          openingMessage,
          clientSocket,
        });

        if (clientSocket.readyState !== WebSocket.OPEN) {
          cleanupSession(nextSession);
          return;
        }

        session = nextSession;
        activeSessions.set(sessionId, nextSession);
        console.log('Live interview session ready:', sessionId);
        safeSendJson(clientSocket, {
          type: 'SessionReady',
          sessionId,
        });
      } catch (err) {
        console.error('Failed to start live interview session:', err);
        safeSendJson(clientSocket, { type: 'Error', message: INTERVIEW_UNAVAILABLE_MESSAGE });
      } finally {
        isStarting = false;
      }

      return;
    }

    if (payload.type === 'InjectUserMessage') {
      if (!session || session.isClosed || !session.isReady) {
        safeSendJson(clientSocket, {
          type: 'Error',
          message: 'The interviewer is still connecting. Try again in a moment.',
        });
        return;
      }

      if (!isNonEmptyString(payload.content)) {
        safeSendJson(clientSocket, { type: 'Error', message: 'Message content is required.' });
        return;
      }

      if (session.socket.readyState !== WebSocket.OPEN) {
        safeSendJson(clientSocket, { type: 'Error', message: 'The interviewer connection is unavailable.' });
        return;
      }

      session.socket.send(JSON.stringify({
        type: 'InjectUserMessage',
        content: payload.content.trim(),
      }));
      return;
    }

    if (payload.type === 'FinishSession') {
      cleanupLiveSession();
      return;
    }

    safeSendJson(clientSocket, { type: 'Error', message: `Unsupported live interview event: ${payload.type}` });
  });

  clientSocket.on('close', () => {
    console.log('Client disconnected from live interview bridge');
    cleanupLiveSession();
  });

  clientSocket.on('error', (err) => {
    console.error('Live interview client socket error:', err);
    cleanupLiveSession();
  });
});

const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (clientSocket) => {
  console.log('Client connected to Deepgram proxy');

  if (!process.env.DEEPGRAM_API_KEY) {
    safeSendJson(clientSocket, { type: 'error', message: VOICE_FALLBACK_MESSAGE });
    clientSocket.close();
    return;
  }

  const deepgramSocket = new WebSocket(
    DEEPGRAM_LISTEN_WS_URL,
    { headers: { Authorization: `Token ${process.env.DEEPGRAM_API_KEY}` } }
  );

  clientSocket.on('message', (data) => {
    if (deepgramSocket.readyState === WebSocket.OPEN) {
      deepgramSocket.send(data);
    }
  });

  deepgramSocket.on('message', (data, isBinary) => {
    if (clientSocket.readyState === WebSocket.OPEN) {
      clientSocket.send(normalizeWebSocketMessage(data, isBinary), { binary: isBinary });
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

server.on('upgrade', (request, socket, head) => {
  let pathname = '';

  try {
    pathname = new URL(request.url || '/', 'http://localhost').pathname;
  } catch (err) {
    console.error('Invalid websocket upgrade URL:', err);
    socket.destroy();
    return;
  }

  if (pathname === LIVE_INTERVIEW_WS_PATH) {
    liveInterviewWss.handleUpgrade(request, socket, head, (ws) => {
      liveInterviewWss.emit('connection', ws, request);
    });
    return;
  }

  if (pathname === '/deepgram') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
    return;
  }

  socket.destroy();
});

app.post('/api/interview/sessions', async (req, res) => {
  const { scenarioId } = req.body || {};

  if (!isNonEmptyString(scenarioId)) {
    return res.status(400).json({ error: 'Invalid session payload' });
  }

  if (!process.env.DEEPGRAM_API_KEY) {
    return res.status(500).json({ error: INTERVIEW_UNAVAILABLE_MESSAGE });
  }

  const scenario = await getScenarioById(scenarioId.trim());
  if (!scenario) {
    return res.status(404).json({ error: 'Scenario not found' });
  }

  try {
    const sessionId = createId('session');
    const openingMessage = buildOpeningMessage(scenario);
    const voiceAgentSession = await createVoiceAgentSession({
      sessionId,
      scenario,
      openingMessage,
    });

    activeSessions.set(sessionId, voiceAgentSession);

    return res.json({
      sessionId,
      openingMessage,
    });
  } catch (err) {
    console.error('Failed to create interview session:', err);
    return res.status(500).json({ error: INTERVIEW_UNAVAILABLE_MESSAGE });
  }
});

app.post('/api/interview/sessions/:sessionId/messages', async (req, res) => {
  const sessionId = req.params.sessionId;
  const { content, source, clientTs } = req.body || {};

  if (!isNonEmptyString(content)) {
    return res.status(400).json({ error: 'Invalid message payload' });
  }

  if (!activeSessions.has(sessionId)) {
    return res.status(404).json({ error: 'Interview session not found' });
  }

  const session = activeSessions.get(sessionId);

  try {
    const agentResponse = await sendVoiceAgentMessage(session, content.trim());

    return res.json({
      reply: agentResponse.reply,
      replyTs: Date.now(),
      audioBase64: agentResponse.audioBase64,
      audioMimeType: agentResponse.audioMimeType,
    });
  } catch (err) {
    console.error('Failed to continue interview session:', err);
    return res.status(500).json({ error: INTERVIEW_UNAVAILABLE_MESSAGE });
  }
});

app.delete('/api/interview/sessions/:sessionId', (req, res) => {
  const sessionId = req.params.sessionId;
  const session = activeSessions.get(sessionId);

  if (session) {
    cleanupSession(session);
  }

  return res.status(204).send();
});

app.post('/api/reports', async (req, res) => {
  const { sessionId = null, scenarioId, tracker } = req.body || {};

  if (!isNonEmptyString(scenarioId) || !tracker || typeof tracker !== 'object') {
    return res.status(400).json({ error: 'Invalid report payload' });
  }

  if (!isBackboardConfigured()) {
    return res.status(500).json({ error: REPORT_UNAVAILABLE_MESSAGE });
  }

  const scenario = await getScenarioById(scenarioId.trim());
  if (!scenario) {
    return res.status(404).json({ error: 'Scenario not found' });
  }

  try {
    const assistantIds = await ensureAssistants();
    const backboard = getBackboardConfig();
    const dossier = buildReportDossier({
      scenario: buildScenarioForReport(scenario),
      tracker,
    });

    const reportAgents = getReportAgentMappings(assistantIds);
    const settledAnalyses = await Promise.allSettled(
      reportAgents.map(async ([key, assistantId]) => {
        const rawText = await runAssistantThread({
          assistantId,
          content: buildAnalyzerPrompt(key, dossier),
          provider: backboard.reportProvider,
          model: backboard.reportModel,
          metadata: {
            route: 'report_agent',
            sessionId,
            scenarioId: scenario.id,
            agent: key,
          },
        });

        return [key, sanitizeAnalyzerOutput(key, rawText)];
      })
    );

    const analyses = {};
    settledAnalyses.forEach((result, index) => {
      const [key] = reportAgents[index];
      if (result.status === 'fulfilled') {
        const [resolvedKey, analysis] = result.value;
        analyses[resolvedKey] = analysis;
        return;
      }

      console.error(`Report agent ${key} failed:`, result.reason);
      analyses[key] = sanitizeAnalyzerOutput(key, result.reason?.message || '');
    });

    let finalReport;

    try {
      const synthesis = await runAssistantThread({
        assistantId: assistantIds.synthesizer,
        content: buildSynthesizerPrompt({ dossier, analyses }),
        provider: backboard.reportProvider,
        model: backboard.reportModel,
        metadata: {
          route: 'report_agent',
          sessionId,
          scenarioId: scenario.id,
          agent: 'synthesizer',
        },
      });

      finalReport = sanitizeFinalReport(synthesis, dossier, analyses);
    } catch (err) {
      console.error('Report synthesis failed:', err);
      finalReport = buildFallbackReport({ dossier, analyses });
    }

    return res.json({ report: finalReport });
  } catch (err) {
    console.error('Failed to generate report:', err);
    return res.status(500).json({ error: REPORT_UNAVAILABLE_MESSAGE });
  }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Spar server running on :${PORT}`));
