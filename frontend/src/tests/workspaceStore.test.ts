import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useWorkspaceStore } from '../stores/workspaceStore';

describe('useWorkspaceStore', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().clearWorkspace();
  });

  it('initializes with default workspace state', () => {
    const state = useWorkspaceStore.getState();
    expect(state.activeRepository).toBeNull();
    expect(state.selectedFilePath).toBeNull();
    expect(state.selectedFileDetail).toBeNull();
    expect(state.scanStatus).toBe('idle');
  });

  it('updates selectedFilePath via setSelectedFile', () => {
    useWorkspaceStore.getState().setSelectedFile('src/main.py');
    let state = useWorkspaceStore.getState();
    expect(state.selectedFilePath).toBe('src/main.py');

    useWorkspaceStore.getState().setSelectedFile(null);
    state = useWorkspaceStore.getState();
    expect(state.selectedFilePath).toBeNull();
    expect(state.selectedFileDetail).toBeNull();
  });

  it('clears chat history and workspace state', () => {
    useWorkspaceStore.setState({
      activeRepository: '/mock/repo',
      scanStatus: 'indexed',
      chatMessages: [
        {
          id: '1',
          role: 'user',
          content: 'hello',
          timestamp: new Date().toISOString(),
        },
      ],
    });

    useWorkspaceStore.getState().clearChatHistory();
    expect(useWorkspaceStore.getState().chatMessages).toEqual([]);

    useWorkspaceStore.getState().clearWorkspace();
    const cleared = useWorkspaceStore.getState();
    expect(cleared.activeRepository).toBeNull();
    expect(cleared.scanStatus).toBe('idle');
  });

  it('openRepository resets stale state and populates repository data', async () => {
    // Populate old stale state from prior repo
    useWorkspaceStore.setState({
      activeRepository: '/old/stale/repo',
      activeRepositoryId: 99,
      chatMessages: [{ id: '1', role: 'user', content: 'old chat', timestamp: '2026-01-01' }],
      searchResults: [{
        file_path: 'old.py',
        entity_name: 'old_func',
        entity_type: 'function',
        score: 1.0,
        source_code: 'def old_func(): pass',
        docstring: '',
        start_line: 1,
        end_line: 1,
      }],
      graphData: { nodes: [{ id: '1', label: 'old', type: 'module' }], edges: [] },
      scanStatus: 'idle',
    });

    const mockRepo = {
      id: 42,
      name: 'summer-project-1',
      source_type: 'github' as const,
      source_path: 'https://github.com/Arnav-aka-guy/Repository-scanner-engine',
      path: 'C:/repos/summer-project-1',
      status: 'READY' as const,
      file_count: 10,
      total_files: 10,
      total_lines: 500,
      languages: { Python: 500 },
      last_scanned_at: '2026-11-07T12:00:00Z',
    };

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({
      ok: true,
      json: async () => [],
    } as any));

    await useWorkspaceStore.getState().openRepository(mockRepo);
    fetchMock.mockRestore();

    const state = useWorkspaceStore.getState();
    // Uses disk path over github URL
    expect(state.activeRepository).toBe('C:/repos/summer-project-1');
    expect(state.activeRepositoryId).toBe(42);
    // Mapped status
    expect(state.scanStatus).toBe('indexed');
    // Populated repositoryInfo
    expect(state.repositoryInfo?.name).toBe('summer-project-1');
    expect(state.repositoryInfo?.total_files).toBe(10);
    // Stale state reset
    expect(state.chatMessages).toEqual([]);
    expect(state.searchResults).toEqual([]);
    expect(state.graphData).toBeNull();
  });

  it('scanRepo resolves a new repository ID and does not attach to previous activeRepositoryId', async () => {
    useWorkspaceStore.setState({
      activeRepository: '/old/repo',
      activeRepositoryId: 42,
      scanStatus: 'idle',
    });

    const completedResult = {
      path: '/new/fresh-repo',
      name: 'fresh-repo',
      total_files: 3,
      total_lines: 50,
      languages: { Python: 50 },
      scanned_at: '2026-11-07T12:00:00Z',
    };

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any, init?: any) => {
      const urlStr = String(url);
      const method = init?.method?.toUpperCase() || 'GET';
      if (urlStr.endsWith('/repositories') && method === 'POST') {
        return {
          ok: true,
          json: async () => ({
            id: 88,
            name: 'fresh-repo',
            source_type: 'local',
            source_path: '/new/fresh-repo',
            status: 'CREATED',
            file_count: 0,
            total_files: 0,
            total_lines: 0,
            languages: {},
          }),
        } as any;
      }
      if (urlStr.includes('/repository/scan/events/')) {
        const stream = new ReadableStream({
          start(controller) {
            const dataStr = 'data: ' + JSON.stringify({
              job_id: 'job-123',
              status: 'completed',
              progress: 1.0,
              message: 'Done',
              result: completedResult,
            }) + '\n\n';
            controller.enqueue(new TextEncoder().encode(dataStr));
            controller.close();
          },
        });
        return {
          ok: true,
          body: stream,
        } as any;
      }
      if (urlStr.includes('/repository/scan/jobs/')) {
        return {
          ok: true,
          json: async () => ({
            job_id: 'job-123',
            status: 'completed',
            progress: 1.0,
            message: 'Done',
            result: completedResult,
          }),
        } as any;
      }
      if (urlStr.endsWith('/repositories')) {
        return {
          ok: true,
          json: async () => ({
            repositories: [],
            count: 0,
            max_limit: 5,
            available_slots: 5,
          }),
        } as any;
      }
      if (urlStr.includes('/repository/scan/async')) {
        return {
          ok: true,
          json: async () => ({
            job_id: 'job-123',
            status: 'pending',
            progress: 0.1,
            message: 'Pending',
          }),
        } as any;
      }
      if (urlStr.includes('/repository/files')) {
        return {
          ok: true,
          json: async () => [],
        } as any;
      }
      // POST /repositories
      return {
        ok: true,
        json: async () => ({
          id: 88,
          name: 'fresh-repo',
          source_type: 'local',
          source_path: '/new/fresh-repo',
          status: 'CREATED',
          file_count: 0,
          total_files: 0,
          total_lines: 0,
          languages: {},
        }),
      } as any;
    });

    await useWorkspaceStore.getState().scanRepo('/new/fresh-repo');

    const state = useWorkspaceStore.getState();
    expect(state.activeRepositoryId).toBe(88);
    expect(state.activeRepositoryId).not.toBe(42);
    expect(state.activeRepository).toBe('/new/fresh-repo');

    fetchMock.mockRestore();
  });
});