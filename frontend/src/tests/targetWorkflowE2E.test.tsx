import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { MainLayout } from '../layouts/MainLayout';
import { Sidebar } from '../components/Sidebar';
import * as repoService from '../services/repository';
import { SavedRepository, FileInfo } from '../types/repository';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('Section C End-to-End Target Workflow Verification', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    vi.restoreAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    useWorkspaceStore.getState().clearWorkspace({ silent: true });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  // Step 4: Add repository -> creates row -> starts background scan -> turns READY/indexed
  it('Step 4: scanRepo initiates background job, tracks progress, and marks repository as indexed', async () => {
    vi.spyOn(repoService, 'getUserRepositories').mockResolvedValue({
      repositories: [],
      count: 0,
      max_limit: 10,
      available_slots: 10,
    });
    vi.spyOn(repoService, 'createUserRepository').mockResolvedValue({
      id: 55,
      name: 'alpha-repo',
      source_type: 'local',
      source_path: '/repos/alpha-repo',
      path: '/repos/alpha-repo',
      status: 'SCANNING',
      total_files: 0,
      file_count: 0,
      total_lines: 0,
      languages: {},
    });
    vi.spyOn(repoService, 'scanRepositoryAsync').mockResolvedValue({
      job_id: 'job-55',
      repo_path: '/repos/alpha-repo',
      status: 'scanning',
      progress: 0.1,
      message: 'Indexing files...',
    });
    vi.spyOn(repoService, 'subscribeScanEvents').mockImplementation((_jobId, onProgress) => {
      setTimeout(() => {
        onProgress({
          job_id: 'job-55',
          status: 'completed',
          progress: 1.0,
          message: 'Scan completed successfully',
          result: {
            path: '/repos/alpha-repo',
            name: 'alpha-repo',
            total_files: 12,
            total_lines: 840,
            languages: { TypeScript: 12 },
            scanned_at: new Date().toISOString(),
          },
        });
      }, 50);
      return () => {};
    });

    const mockFile: FileInfo = {
      name: 'index.ts',
      path: '/repos/alpha-repo/src/index.ts',
      size_bytes: 100,
      line_count: 20,
      language: 'typescript',
      extension: '.ts',
    };
    vi.spyOn(repoService, 'listFiles').mockResolvedValue([mockFile]);

    await useWorkspaceStore.getState().scanRepo('/repos/alpha-repo');

    const state = useWorkspaceStore.getState();
    expect(state.activeRepositoryId).toBe(55);
    expect(state.activeRepository).toBe('/repos/alpha-repo');
    expect(state.scanStatus).toBe('indexed');
    expect(state.files).toHaveLength(1);
    expect(state.fileTree).toHaveLength(1);
    expect(state.repositoryInfo?.total_files).toBe(12);
  });

  // Step 5: Clicking a repo -> loads files, tree, and scoped sidebar links stay inside /app/repositories/:id/...
  it('Step 5: openRepository loads repository data and Sidebar links reflect scoped URL', async () => {
    const mockFile: FileInfo = {
      name: 'app.py',
      path: '/repos/beta-repo/app.py',
      size_bytes: 250,
      line_count: 35,
      language: 'python',
      extension: '.py',
    };
    vi.spyOn(repoService, 'listFiles').mockResolvedValue([mockFile]);

    const betaRepo: SavedRepository = {
      id: 77,
      name: 'beta-repo',
      source_type: 'local',
      source_path: '/repos/beta-repo',
      path: '/repos/beta-repo',
      status: 'READY',
      total_files: 5,
      file_count: 5,
      total_lines: 450,
      languages: { Python: 5 },
    };

    await useWorkspaceStore.getState().openRepository(betaRepo);

    const state = useWorkspaceStore.getState();
    expect(state.activeRepositoryId).toBe(77);
    expect(state.activeRepository).toBe('/repos/beta-repo');
    expect(state.files).toHaveLength(1);

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/app/repositories/77/overview']}>
          <Sidebar />
        </MemoryRouter>
      );
    });

    const overviewLink = container.querySelector('a[href="/app/repositories/77/overview"]');
    const explorerLink = container.querySelector('a[href="/app/repositories/77/explorer"]');
    const graphLink = container.querySelector('a[href="/app/repositories/77/graph"]');
    expect(overviewLink).not.toBeNull();
    expect(explorerLink).not.toBeNull();
    expect(graphLink).not.toBeNull();
  });

  // Step 7: Switching repos clears old data and loads new repo without stale data
  it('Step 7: switching repositories resets previous files, graphs, and search results', async () => {
    const mockFile1: FileInfo = {
      name: 'r1.py',
      path: '/repos/repo-1/r1.py',
      size_bytes: 10,
      line_count: 5,
      language: 'python',
      extension: '.py',
    };
    useWorkspaceStore.setState({
      activeRepositoryId: 10,
      activeRepository: '/repos/repo-1',
      files: [mockFile1],
      graphData: { nodes: [{ id: 'n1', label: 'r1' }], edges: [] } as any,
      searchResults: [{ entity_name: 'func1' } as any],
    });

    const mockFile2: FileInfo = {
      name: 'r2.ts',
      path: '/repos/repo-2/r2.ts',
      size_bytes: 20,
      line_count: 10,
      language: 'typescript',
      extension: '.ts',
    };
    vi.spyOn(repoService, 'listFiles').mockResolvedValue([mockFile2]);

    const repo2: SavedRepository = {
      id: 20,
      name: 'repo-2',
      source_type: 'local',
      source_path: '/repos/repo-2',
      status: 'READY',
      total_files: 1,
      file_count: 1,
      total_lines: 50,
      languages: { TypeScript: 1 },
    };

    // Switch to Repo 2
    await useWorkspaceStore.getState().openRepository(repo2);

    const state = useWorkspaceStore.getState();
    expect(state.activeRepositoryId).toBe(20);
    expect(state.activeRepository).toBe('/repos/repo-2');
    expect(state.graphData).toBeNull();
    expect(state.searchResults).toHaveLength(0);
    expect(state.files[0].name).toBe('r2.ts');
  });

  // Step 8: F5 reloads the same page and restores the active repo via targetRepoId
  it('Step 8: MainLayout restores active repository from scoped URL on refresh', async () => {
    vi.spyOn(repoService, 'getUserRepository').mockResolvedValue({
      id: 99,
      name: 'gamma-repo',
      source_type: 'local',
      source_path: '/repos/gamma-repo',
      path: '/repos/gamma-repo',
      status: 'READY',
      total_files: 8,
      file_count: 8,
      total_lines: 600,
      languages: { Python: 8 },
    });
    vi.spyOn(repoService, 'listFiles').mockResolvedValue([]);

    // Clear active repo state before refresh simulation
    useWorkspaceStore.setState({
      activeRepositoryId: null,
      activeRepository: null,
    });

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/app/repositories/99/explorer']}>
          <Routes>
            <Route path="/app/repositories/:repositoryId/*" element={<MainLayout />}>
              <Route path="explorer" element={<div data-testid="explorer-view">Explorer Page Content</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      );
    });

    expect(useWorkspaceStore.getState().activeRepositoryId).toBe(99);
    expect(useWorkspaceStore.getState().activeRepository).toBe('/repos/gamma-repo');
    expect(container.textContent).toContain('Explorer Page Content');
  });
});
