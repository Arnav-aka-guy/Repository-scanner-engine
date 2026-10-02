import { describe, it, expect, beforeEach } from 'vitest';
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
});
