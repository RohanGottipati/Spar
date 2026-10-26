function normalizeBaseUrl(baseUrl) {
  return typeof baseUrl === 'string' ? baseUrl.trim().replace(/\/$/, '') : '';
}

function getConfiguredApiBaseUrl() {
  return normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL);
}

export function buildApiUrl(path) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const configuredBaseUrl = getConfiguredApiBaseUrl();

  if (configuredBaseUrl) {
    return `${configuredBaseUrl}${normalizedPath}`;
  }

  return normalizedPath;
}

export function buildWebSocketUrl(path) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const configuredBaseUrl = getConfiguredApiBaseUrl();

  if (configuredBaseUrl) {
    return `${configuredBaseUrl.replace(/^http/i, 'ws')}${normalizedPath}`;
  }

  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

    // In local Vite dev, connect websocket features straight to the backend
    // rather than relying on the dev-server websocket proxy.
    if (
      window.location.port === '5173'
      && (normalizedPath.startsWith('/api/') || normalizedPath === '/deepgram')
    ) {
      return `${protocol}//${window.location.hostname}:3001${normalizedPath}`;
    }

    return `${protocol}//${window.location.host}${normalizedPath}`;
  }

  return `ws://localhost:3001${normalizedPath}`;
}
