import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getWorkspaceStorageKey, useWorkspaceStore } from '../stores/workspaceStore';
import { useAuthStore } from '../stores/authStore';

describe('B13 Multi-User Storage Isolation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    useWorkspaceStore.getState().clearWorkspace({ silent: true });
    useAuthStore.setState({ token: null, user: null, loginError: null });
  });

  it('namespaces workspace key by user ID from antigravity-auth', () => {
    expect(getWorkspaceStorageKey()).toBe('antigravity-workspace:local');

    localStorage.setItem(
      'antigravity-auth',
      JSON.stringify({
        state: {
          user: { id: 42, email: 'user42@example.com' },
          token: 'token-42',
        },
      })
    );

    expect(getWorkspaceStorageKey()).toBe('antigravity-workspace:user-42');

    localStorage.setItem(
      'antigravity-auth',
      JSON.stringify({
        state: {
          user: { id: 99, email: 'user99@example.com' },
          token: 'token-99',
        },
      })
    );

    expect(getWorkspaceStorageKey()).toBe('antigravity-workspace:user-99');
  });

  it('clears in-memory workspace state when user changes on login', async () => {
    // User 1 session state
    useAuthStore.setState({
      user: { id: 1, email: 'user1@example.com', name: 'User 1', repository_count: 0, max_repositories: 5 },
      token: 'tok-1',
    });
    useWorkspaceStore.setState({
      activeRepository: '/user1/repo',
      activeRepositoryId: 101,
      recentRepositories: ['/user1/repo'],
      chatMessages: [
        { id: '1', role: 'user', content: 'Secret User 1 query', timestamp: '12:00' },
      ],
    });

    // Mock fetch for User 2 login
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      if (String(url).includes('/api/auth/login')) {
        return new Response(
          JSON.stringify({
            access_token: 'tok-2',
            user: { id: 2, email: 'user2@example.com', name: 'User 2', repository_count: 0, max_repositories: 5 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('{}', { status: 200 });
    });

    const result = await useAuthStore.getState().login('user2@example.com', 'pass123');
    expect(result.success).toBe(true);

    const wsState = useWorkspaceStore.getState();
    expect(wsState.activeRepository).toBeNull();
    expect(wsState.activeRepositoryId).toBeNull();
    expect(wsState.chatMessages).toHaveLength(0);
    expect(wsState.recentRepositories).toHaveLength(0);
  });

  it('clears workspace state on logout', () => {
    useAuthStore.setState({
      user: { id: 1, email: 'user1@example.com', name: 'User 1', repository_count: 0, max_repositories: 5 },
      token: 'tok-1',
    });
    useWorkspaceStore.setState({
      activeRepository: '/user1/repo',
      activeRepositoryId: 101,
      recentRepositories: ['/user1/repo'],
    });

    useAuthStore.getState().logout();

    const wsState = useWorkspaceStore.getState();
    expect(wsState.activeRepository).toBeNull();
    expect(wsState.activeRepositoryId).toBeNull();
    expect(wsState.recentRepositories).toHaveLength(0);
  });
});
