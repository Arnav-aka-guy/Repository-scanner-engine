const API_BASE = '/api';

export async function apiGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${API_BASE}${path}`, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([key, val]) => url.searchParams.append(key, val));
  }

  const response = await fetch(url.toString());
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error (${response.status}): ${text || response.statusText}`);
  }

  return response.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: any): Promise<T> {
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
