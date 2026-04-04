require('dotenv').config();
const crypto = require('crypto');
const path = require('path');
const express = require('express');
const cors = require('cors');
const { createServer } = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const { ensureAssistants } = require('./lib/assistants');
const {
  addMessage,
  createThread,
  extractContent,
  getBackboardConfig,
  isBackboardConfigured,
} = require('./lib/backboard');
const {
  buildLiveScenarioContext,
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
const activeSessions = new Map();

app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const server = createServer(app);

function safeSendJson(socket, payload) {
  if (socket.readyState === WebSocket.OPEN) {
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
  return `Alright — ${scenario.description}. Take a look at the codebase and walk me through where you want to start.`;
}

function buildSeedMessage(scenario) {
  return JSON.stringify({
    type: 'session_context',
    instructions: 'This message seeds scenario context for the interviewer. It is not a candidate utterance.',
    scenario: buildLiveScenarioContext(scenario),
  });
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
    backboardConfigured: isBackboardConfigured(),
    backboardBaseUrl: backboard.baseUrl,
    backboardLiveProvider: backboard.liveProvider,
    backboardLiveModel: backboard.liveModel,
    backboardReportProvider: backboard.reportProvider,
    backboardReportModel: backboard.reportModel,
    activeSessionCount: activeSessions.size,
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

app.post('/api/interview/sessions', async (req, res) => {
  const { scenarioId } = req.body || {};

  if (!isNonEmptyString(scenarioId)) {
    return res.status(400).json({ error: 'Invalid session payload' });
  }

  if (!isBackboardConfigured()) {
    return res.status(500).json({ error: INTERVIEW_UNAVAILABLE_MESSAGE });
  }

  const scenario = await getScenarioById(scenarioId.trim());
  if (!scenario) {
    return res.status(404).json({ error: 'Scenario not found' });
  }

  try {
    const assistantIds = await ensureAssistants();
    const thread = await createThread(assistantIds.liveInterviewer);
    const threadId = getThreadId(thread);

    if (!threadId) {
      throw new Error('Backboard thread creation did not return a thread ID');
    }

    const sessionId = createId('session');
    await addMessage(threadId, {
      content: buildSeedMessage(scenario),
      stream: false,
      memory: 'off',
      send_to_llm: 'false',
      metadata: {
        route: 'interview_seed',
        sessionId,
        scenarioId: scenario.id,
      },
    });

    activeSessions.set(sessionId, {
      sessionId,
      scenarioId: scenario.id,
      threadId,
      createdAt: Date.now(),
    });

    return res.json({
      sessionId,
      openingMessage: buildOpeningMessage(scenario),
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

  if (!isBackboardConfigured()) {
    return res.status(500).json({ error: INTERVIEW_UNAVAILABLE_MESSAGE });
  }

  const session = activeSessions.get(sessionId);
  const backboard = getBackboardConfig();

  try {
    const response = await addMessage(session.threadId, {
      content: content.trim(),
      llm_provider: backboard.liveProvider,
      model_name: backboard.liveModel,
      stream: false,
      memory: 'off',
      web_search: 'off',
      metadata: {
        route: 'interview_turn',
        sessionId,
        scenarioId: session.scenarioId,
        source: source || 'unknown',
        clientTs: typeof clientTs === 'number' ? clientTs : null,
      },
    });

    const reply = extractContent(response);
    if (!reply) {
      throw new Error('Backboard response was empty');
    }

    return res.json({
      reply,
      replyTs: Date.now(),
    });
  } catch (err) {
    console.error('Failed to continue interview session:', err);
    return res.status(500).json({ error: INTERVIEW_UNAVAILABLE_MESSAGE });
  }
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
