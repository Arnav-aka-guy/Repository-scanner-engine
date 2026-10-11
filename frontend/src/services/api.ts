import { useAuthStore } from '../stores/authStore';

const API_BASE = '/api';

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        const newToken = data.access_token;
        useAuthStore.getState().setToken(newToken);
        if (data.user) {
          useAuthStore.getState().setUser(data.user);
        }
        return newToken;
      }
    } catch {
      // refresh failed
    } finally {
      refreshPromise = null;
    }
    useAuthStore.getState().logout();
    return null;
  })();

  return refreshPromise;
}

function getAuthHeaders(): Record<string, string> {
  const token = useAuthStore.getState().token;
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}

function formatApiError(status: number, text: string, statusText: string): string {
  try {
    const data = JSON.parse(text);
    if (data?.detail) {
      const msg = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
      return msg;
    }
  } catch {
    // not JSON
  }
  return text || statusText || `HTTP ${status}`;
}

export async function apiGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${API_BASE}${path}`, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([key, val]) => url.searchParams.append(key, val));
  }

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      headers: {
        ...getAuthHeaders(),
      },
    });
  } catch (err: unknown) {
    if (err instanceof TypeError && err.message.toLowerCase().includes('failed to fetch')) {
      throw new Error(
        'Unable to connect to the backend server. Please ensure the backend is running on http://127.0.0.1:8000.',
        { cause: err }
      );
    }
    throw err;
  }

  if (response.status === 401 && !path.startsWith('/auth/')) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      response = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${newToken}` },
      });
    }
  }

  if (response.status === 401) {
    useAuthStore.getState().logout();
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(formatApiError(response.status, text, response.statusText));
  }

  return response.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify(body),
    });
  } catch (err: unknown) {
    if (err instanceof TypeError && err.message.toLowerCase().includes('failed to fetch')) {
      throw new Error(
        'Unable to connect to the backend server. Please ensure the backend is running on http://127.0.0.1:8000.',
        { cause: err }
      );
    }
    throw err;
  }

  if (response.status === 401 && !path.startsWith('/auth/')) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      response = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${newToken}`,
        },
        body: JSON.stringify(body),
      });
    }
  }

  if (response.status === 401) {
    useAuthStore.getState().logout();
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(formatApiError(response.status, text, response.statusText));
  }

  return response.json() as Promise<T>;
}

export async function apiPostStream(
  path: string,
  body: unknown,
  onChunk: (chunk: string) => void,
  onClose?: () => void,
  onDone?: (payload?: { sources?: unknown[]; content?: string }) => void
): Promise<void> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(body),
  });

  if (response.status === 401) {
    useAuthStore.getState().logout();
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error (${response.status}): ${text || response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response body has no reader.');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep partial line in buffer

      for (const line of lines) {
        const cleanLine = line.trim();
        if (!cleanLine) continue;

        if (cleanLine.startsWith('data: ')) {
          const data = cleanLine.slice(6);
          if (data === '[DONE]') {
            if (onClose) onClose();
            return;
          }
          try {
            // Check if it's JSON
            const parsed = JSON.parse(data);
            // Handle backend's done signal
            if (parsed.type === 'done') {
              if (onDone) onDone(parsed);
              if (onClose) onClose();
              return;
            }
            // Handle error payloads from the backend
            if (parsed.type === 'error') {
              onChunk(parsed.content || 'An error occurred.');
              if (onClose) onClose();
              return;
            }
            if (parsed.token) {
              onChunk(parsed.token);
            } else if (parsed.content) {
              onChunk(parsed.content);
            }
          } catch {
            // Fallback: just yield plain string if not JSON
            onChunk(data);
          }
        }
      }
    }
    // Stream ended naturally — call onClose if not already called
    if (onClose) onClose();
  } finally {
    reader.releaseLock();
  }
}

export async function apiDelete<T = unknown>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${API_BASE}${path}`, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([key, val]) => url.searchParams.append(key, val));
  }

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: 'DELETE',
      headers: {
        ...getAuthHeaders(),
      },
    });
  } catch (err: unknown) {
    if (err instanceof TypeError && err.message.toLowerCase().includes('failed to fetch')) {
      throw new Error(
        'Unable to connect to the backend server. Please ensure the backend is running on http://127.0.0.1:8000.',
        { cause: err }
      );
    }
    throw err;
  }

  if (response.status === 401 && !path.startsWith('/auth/')) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      response = await fetch(url.toString(), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${newToken}` },
      });
    }
  }

  if (response.status === 401) {
    useAuthStore.getState().logout();
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(formatApiError(response.status, text, response.statusText));
  }

  return response.json() as Promise<T>;
}
