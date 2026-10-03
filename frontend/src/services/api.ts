const API_BASE = '/api';

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
    response = await fetch(url.toString());
  } catch (err: any) {
    if (err instanceof TypeError && err.message.toLowerCase().includes('failed to fetch')) {
      throw new Error(
        'Unable to connect to the backend server. Please ensure the backend is running on http://127.0.0.1:8000.'
      );
    }
    throw err;
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(formatApiError(response.status, text, response.statusText));
  }

  return response.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: any): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (err: any) {
    if (err instanceof TypeError && err.message.toLowerCase().includes('failed to fetch')) {
      throw new Error(
        'Unable to connect to the backend server. Please ensure the backend is running on http://127.0.0.1:8000.'
      );
    }
    throw err;
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(formatApiError(response.status, text, response.statusText));
  }

  return response.json() as Promise<T>;
}

export async function apiPostStream(
  path: string,
  body: any,
  onChunk: (chunk: string) => void,
  onClose?: () => void
): Promise<void> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

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
