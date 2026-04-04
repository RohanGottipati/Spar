const DEFAULT_BASE_URL = 'https://app.backboard.io/api';

function getBackboardConfig() {
  return {
    apiKey: process.env.BACKBOARD_API_KEY || '',
    baseUrl: (process.env.BACKBOARD_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, ''),
    liveProvider: process.env.BACKBOARD_LIVE_PROVIDER || 'google',
    liveModel: process.env.BACKBOARD_LIVE_MODEL || 'gemini-2.5-flash',
    reportProvider: process.env.BACKBOARD_REPORT_PROVIDER || 'google',
    reportModel: process.env.BACKBOARD_REPORT_MODEL || 'gemini-2.5-flash',
  };
}

function isBackboardConfigured() {
  return Boolean(getBackboardConfig().apiKey);
}

async function parseJsonSafe(response) {
  try {
    return await response.json();
  } catch (_err) {
    return null;
  }
}

async function backboardRequest(endpoint, { method = 'GET', body } = {}) {
  const config = getBackboardConfig();
  if (!config.apiKey) {
    throw new Error('BACKBOARD_API_KEY is not configured');
  }

  const response = await fetch(`${config.baseUrl}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': config.apiKey,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await parseJsonSafe(response);
  if (!response.ok) {
    const details = data ? JSON.stringify(data) : 'No response body';
    throw new Error(`Backboard request failed (${response.status} ${response.statusText}): ${details}`);
  }

  return data;
}

function normalizeAssistantList(data) {
  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data?.assistants)) {
    return data.assistants;
  }

  if (Array.isArray(data?.data)) {
    return data.data;
  }

  if (Array.isArray(data?.items)) {
    return data.items;
  }

  return [];
}

function stringifyMetadata(metadata) {
  if (!metadata) {
    return undefined;
  }

  return typeof metadata === 'string' ? metadata : JSON.stringify(metadata);
}

function extractContent(data) {
  if (typeof data?.content === 'string' && data.content.trim()) {
    return data.content.trim();
  }

  if (typeof data?.message === 'string' && data.message.trim()) {
    return data.message.trim();
  }

  if (Array.isArray(data?.content)) {
    const joined = data.content
      .map((part) => part?.text?.value || part?.text || part?.content || '')
      .filter(Boolean)
      .join('\n')
      .trim();

    if (joined) {
      return joined;
    }
  }

  return '';
}

async function listAssistants() {
  const data = await backboardRequest('/assistants');
  return normalizeAssistantList(data);
}

async function createAssistant(payload) {
  return backboardRequest('/assistants', { method: 'POST', body: payload });
}

async function createThread(assistantId) {
  return backboardRequest(`/assistants/${assistantId}/threads`, { method: 'POST', body: {} });
}

async function addMessage(threadId, payload) {
  const body = {
    ...payload,
    metadata: stringifyMetadata(payload?.metadata),
  };

  return backboardRequest(`/threads/${threadId}/messages`, { method: 'POST', body });
}

module.exports = {
  addMessage,
  backboardRequest,
  createAssistant,
  createThread,
  extractContent,
  getBackboardConfig,
  isBackboardConfigured,
  listAssistants,
};
