import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useWorkspaceStore } from '../stores/workspaceStore';
import * as repoService from '../services/repository';
import { StatusBar } from '../components/StatusBar';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('B12 Scan Progress and Cancellation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useWorkspaceStore.getState().clearWorkspace({ silent: true });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(JSON.stringify({ embedding_model: 'test-model' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
  });

  it('cancelScan calls cancelScanJob and resets scanStatus to idle', async () => {
    const cancelSpy = vi.spyOn(repoService, 'cancelScanJob').mockResolvedValue({
      job_id: 'job-123',
      repo_path: '/test/repo',
      status: 'cancelled',
      progress: 0.5,
      message: 'Cancelled',
    });

    useWorkspaceStore.setState({
      activeRepository: '/test/repo',
      scanStatus: 'scanning',
      currentScanJobId: 'job-123',
    });

    await useWorkspaceStore.getState().cancelScan();

    expect(cancelSpy).toHaveBeenCalledWith('job-123');
    const state = useWorkspaceStore.getState();
    expect(state.scanStatus).toBe('idle');
    expect(state.scanMessage).toBe('Scan cancelled.');
    expect(state.currentScanJobId).toBeNull();
  });

  it('StatusBar displays Cancel button when scanStatus is scanning and currentScanJobId is set', async () => {
    const cancelSpy = vi.spyOn(repoService, 'cancelScanJob').mockResolvedValue({
      job_id: 'job-999',
      repo_path: '/test/repo',
      status: 'cancelled',
      progress: 0.5,
      message: 'Cancelled',
    });

    useWorkspaceStore.setState({
      activeRepository: '/test/repo',
      scanStatus: 'scanning',
      currentScanJobId: 'job-999',
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<StatusBar repoPath="/test/repo" />);
    });

    const cancelBtn = container.querySelector('button');
    expect(cancelBtn).not.toBeNull();
    expect(cancelBtn?.textContent).toContain('Cancel');

    await act(async () => {
      cancelBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(cancelSpy).toHaveBeenCalledWith('job-999');
  });
});
