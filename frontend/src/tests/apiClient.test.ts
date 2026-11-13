import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiGet, apiPost, apiDelete, apiPatch, apiPostStream, request } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { useToastStore } from '../stores/toastStore';

describe('API Client (B9)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.setState({ token: 'test-token', user: null });
    useToastStore.setState({ toasts: [] });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('deduplicates concurrent 401 refresh calls and retries with new token', async () => {
    let refreshCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();

      if (url.includes('/api/auth/refresh')) {
        refreshCalls++;
        return new Response(JSON.stringify({ access_token: 'fresh-token' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const authHeader = (init?.headers as Headers)?.get('Authorization') || (init?.headers as Record<string, string>)?.[
        'Authorization'
      ];

      if (authHeader === 'Bearer fresh-token') {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // First attempt fails with 401
      return new Response(JSON.stringify({ detail: 'Token expired' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    // Fire 3 concurrent requests that all get 401
    const [res1, res2, res3] = await Promise.all([
      apiGet<{ success: boolean }>('/test1'),
      apiPost<{ success: boolean }>('/test2', { x: 1 }),
      apiDelete<{ success: boolean }>('/test3'),
    ]);

    expect(res1.success).toBe(true);
    expect(res2.success).toBe(true);
    expect(res3.success).toBe(true);
    expect(refreshCalls).toBe(1); // exactly one refresh call
    expect(useAuthStore.getState().token).toBe('fresh-token');
  });

  it('calls logout once on refresh failure and does not show workspace cleared toast', async () => {
    const logoutSpy = vi.spyOn(useAuthStore.getState(), 'logout');

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('/api/auth/refresh')) {
        return new Response('Invalid refresh token', { status: 401 });
      }
      return new Response(JSON.stringify({ detail: 'Unauthorized' }), { status: 401 });
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(apiGet('/protected')).rejects.toThrow('Unauthorized');

    expect(logoutSpy).toHaveBeenCalledTimes(1);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('handles 204 No Content and empty responses gracefully', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(null, { status: 204 });
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await request<void>('/empty-endpoint');
    expect(result).toBeUndefined();
  });

  it('provides friendly error on HTML SPA fallback response', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response('<!DOCTYPE html><html><body>Error</body></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(apiGet('/endpoint-returning-html')).rejects.toThrow(
      /Unexpected HTML response from server/
    );
  });

  it('supports AbortSignal to cancel requests', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.signal?.aborted) {
        throw new DOMException('The user aborted a request.', 'AbortError');
      }
      return new Response(JSON.stringify({ ok: true }));
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;
    controller.abort();

    await expect(apiGet('/abort-test', undefined, { signal: controller.signal })).rejects.toThrow();
  });

  it('handles network failure in apiPostStream consistently', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(apiPostStream('/stream', { q: 'hi' }, () => {})).rejects.toThrow(
      'Unable to connect to the backend server'
    );
  });
});
