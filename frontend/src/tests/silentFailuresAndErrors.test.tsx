import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { ChatMessage } from '../components/ChatMessage';
import * as repoService from '../services/repository';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('B11 Error Handling and Store Fields', () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;

  beforeEach(() => {
    vi.restoreAllMocks();
    useWorkspaceStore.getState().clearWorkspace({ silent: true });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  it('loadFileDetail writes file errors to fileError and leaves scanError null', async () => {
    vi.spyOn(repoService, 'getFile').mockRejectedValue(new Error('Permission denied on file.py'));

    useWorkspaceStore.setState({
      activeRepository: '/test/repo',
      activeRepositoryId: 10,
      scanError: null,
      fileError: null,
    });

    await useWorkspaceStore.getState().loadFileDetail('file.py');

    const state = useWorkspaceStore.getState();
    expect(state.fileError).toContain('Permission denied on file.py');
    expect(state.scanError).toBeNull();
  });

  it('queueChatMessage queues a message and consumePendingChatMessage clears it', () => {
    useWorkspaceStore.getState().queueChatMessage('Walk me through the architecture');
    expect(useWorkspaceStore.getState().pendingChatMessage).toBe('Walk me through the architecture');

    const consumed = useWorkspaceStore.getState().consumePendingChatMessage();
    expect(consumed).toBe('Walk me through the architecture');
    expect(useWorkspaceStore.getState().pendingChatMessage).toBeNull();
  });

  it('ChatMessage renders friendly setup banner with link to settings on LLM connection error', async () => {
    const errorMsg = {
      id: 'err-1',
      role: 'assistant' as const,
      content: 'LLM Error: ollama: Failed to connect to 127.0.0.1:11434: Connection refused',
      timestamp: '12:00:00',
    };

    await act(async () => {
      root?.render(
        <MemoryRouter>
          <ChatMessage message={errorMsg} />
        </MemoryRouter>
      );
    });

    expect(container?.textContent).toContain('AI Provider Not Configured or Unavailable');
    expect(container?.textContent).toContain('Configure AI Providers in Settings');
    const link = container?.querySelector('a[href="/settings"]');
    expect(link).not.toBeNull();
  });
});
