import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { MyRepositories } from '../pages/MyRepositories';
import * as repoService from '../services/repository';
import { useAuthStore } from '../stores/authStore';
import { SavedRepository } from '../types/repository';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('B1 MyRepositories scan tracking', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.setState({ authEnabled: false, token: null });
  });

  it('keeps card visible with name during scan and updates on completion', async () => {
    const initialRepo: SavedRepository = {
      id: 1,
      name: 'Alpha Project',
      source_path: '/path/to/alpha',
      source_type: 'local',
      status: 'CREATED',
      file_count: 0,
      total_files: 0,
      total_lines: 0,
      language: 'TypeScript',
      languages: { TypeScript: 1 },
      created_at: '2026-01-01',
    };

    const completedRepo: SavedRepository = {
      ...initialRepo,
      status: 'READY',
      file_count: 42,
      total_files: 42,
      total_lines: 1200,
    };

    vi.spyOn(repoService, 'getUserRepositories').mockResolvedValue({
      repositories: [initialRepo],
      count: 1,
      max_limit: 5,
      available_slots: 4,
    });

    vi.spyOn(repoService, 'scanUserRepository').mockResolvedValue({
      job_id: 'job-abc',
      status: 'pending',
      message: 'Scan started',
      repository_id: 1,
    });

    let onProgressCallback: ((job: repoService.ScanJob) => void) | null = null;
    vi.spyOn(repoService, 'subscribeScanEvents').mockImplementation(
      (_jobId, onProgress) => {
        onProgressCallback = onProgress;
        return () => {};
      }
    );

    const getRepoSpy = vi.spyOn(repoService, 'getUserRepository').mockResolvedValue(completedRepo);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <MemoryRouter>
          <MyRepositories />
        </MemoryRouter>
      );
    });

    // Verify card is rendered
    expect(container.textContent).toContain('Alpha Project');
    expect(container.textContent).toContain('/path/to/alpha');

    // Click Scan button
    const scanBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Scan')
    );
    expect(scanBtn).toBeDefined();

    await act(async () => {
      scanBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Card should still be visible, keep its name, and display Scanning…
    expect(container.textContent).toContain('Alpha Project');
    expect(container.textContent).toContain('Scanning…');

    // Open button should be disabled
    const openBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Open')
    );
    expect(openBtn?.getAttribute('disabled')).not.toBeNull();

    // Trigger job completion
    await act(async () => {
      if (onProgressCallback) {
        onProgressCallback({
          job_id: 'job-abc',
          status: 'completed',
          progress: 1.0,
          message: 'Scan complete',
        });
      }
    });

    expect(getRepoSpy).toHaveBeenCalledWith(1);
    expect(container.textContent).toContain('Alpha Project');
    expect(container.textContent).toContain('Ready');
    expect(container.textContent).toContain('42 files');
    expect(openBtn?.getAttribute('disabled')).toBeNull();
  });
});
