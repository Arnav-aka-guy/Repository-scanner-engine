import { useAuthStore } from '../stores/authStore';

const API_BASE = '/api';

export interface ApiRequestOptions extends RequestInit {
  params?: Record<string, string>;
}

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
  if (text && text.trim().startsWith('<')) {
    return `Server error (HTTP ${status}): ${statusText || 'Unexpected HTML response'}`;
  }
  return text || statusText || `HTTP ${status}`;
}

export async function requestRaw(path: string, options: ApiRequestOptions = {}): Promise<Response> {
  const { params, ...init } = options;
  const url = new URL(`${API_BASE}${path}`, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null) {
        url.searchParams.append(key, val);
      }
    });
  }

  const headers = new Headers(init.headers);
  const authHeaders = getAuthHeaders();
  for (const [key, val] of Object.entries(authHeaders)) {
    if (!headers.has(key)) {
      headers.set(key, val);
    }
  }

  const executeFetch = async (fetchHeaders: Headers): Promise<Response> => {
    try {
      return await fetch(url.toString(), {
        ...init,
        headers: fetchHeaders,
      });
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err;
      }
      if (err instanceof TypeError && err.message.toLowerCase().includes('failed to fetch')) {
        throw new Error(
          'Unable to connect to the backend server. Please ensure the backend is running on http://127.0.0.1:8000.',
          { cause: err }
        );
      }
      throw err;
    }
  };

  let response = await executeFetch(headers);

  if (response.status === 401 && !path.startsWith('/auth/')) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      const retryHeaders = new Headers(init.headers);
      retryHeaders.set('Authorization', `Bearer ${newToken}`);
      response = await executeFetch(retryHeaders);
    }
  }

  if (response.status === 401) {
    if (useAuthStore.getState().token) {
      useAuthStore.getState().logout();
    }
  }

  return response;
}

export async function request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const response = await requestRaw(path, options);

  if (!response.ok) {
    let text = '';
    if (typeof response.text === 'function') {
      text = await response.text();
    } else if (typeof response.json === 'function') {
      try {
        const j = await response.json();
        text = JSON.stringify(j);
      } catch {}
    }
    throw new Error(formatApiError(response.status, text, response.statusText));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  if (typeof response.text === 'function') {
    const text = await response.text();
    if (!text.trim()) {
      return undefined as T;
    }
    try {
      return JSON.parse(text) as T;
    } catch (parseErr) {
      if (text.trim().startsWith('<')) {
        throw new Error(
          `Unexpected HTML response from server (HTTP ${response.status}). The requested API endpoint may not exist.`,
          { cause: parseErr }
        );
      }
      throw new Error(`Invalid JSON response from server: ${text.slice(0, 100)}`, { cause: parseErr });
    }
  }

  if (typeof response.json === 'function') {
    return (await response.json()) as T;
  }

  return undefined as T;
}

export async function apiGet<T>(
  path: string,
  params?: Record<string, string>,
  options?: { signal?: AbortSignal }
): Promise<T> {
  return request<T>(path, { method: 'GET', params, signal: options?.signal });
}

export async function apiPost<T>(
  path: string,
  body: unknown,
  options?: { signal?: AbortSignal; params?: Record<string, string> }
): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: options?.signal,
    params: options?.params,
  });
}

export async function apiPatch<T>(
  path: string,
  body: unknown,
  options?: { signal?: AbortSignal; params?: Record<string, string> }
): Promise<T> {
  return request<T>(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: options?.signal,
    params: options?.params,
  });
}

export async function apiDelete<T = unknown>(
  path: string,
  params?: Record<string, string>,
  options?: { signal?: AbortSignal }
): Promise<T> {
  return request<T>(path, { method: 'DELETE', params, signal: options?.signal });
}

export async function apiPostStream(
  path: string,
  body: unknown,
  onChunk: (chunk: string) => void,
  onClose?: () => void,
  onDone?: (payload?: { sources?: unknown[]; content?: string }) => void,
  options?: { signal?: AbortSignal }
): Promise<void> {
  const response = await requestRaw(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: options?.signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(formatApiError(response.status, text, response.statusText));
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
      buffer = lines.pop() || '';

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
            const parsed = JSON.parse(data);
            if (parsed.type === 'done') {
              if (onDone) onDone(parsed);
              if (onClose) onClose();
              return;
            }
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
            onChunk(data);
          }
        }
      }
    }
    if (onClose) onClose();
  } finally {
    reader.releaseLock();
  }
}
