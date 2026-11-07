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
});