function normalizeBaseUrl(baseUrl) {
  return typeof baseUrl === 'string' ? baseUrl.trim().replace(/\/$/, '') : '';
}

export function getConfiguredApiBaseUrl() {
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
    return `${protocol}//${window.location.host}${normalizedPath}`;
  }

  return `ws://localhost:3001${normalizedPath}`;
}
