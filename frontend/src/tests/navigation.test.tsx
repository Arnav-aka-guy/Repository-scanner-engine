import { describe, it, expect, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { MainLayout } from '../layouts/MainLayout';
import { Sidebar } from '../components/Sidebar';
import { StatusBar } from '../components/StatusBar';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useRepoNavigate } from '../hooks/useRepoNavigate';
import * as repoService from '../services/repository';
import { SavedRepository } from '../types/repository';

describe('Phase 1 Navigation & Shell Structure', () => {
  it('renders all required category headers and navigation items in Sidebar', () => {
    const html = renderToString(
      <MemoryRouter initialEntries={['/']}>
        <Sidebar />
      </MemoryRouter>
    );

    // Section headers
    expect(html).toContain('WORKSPACE');
    expect(html).toContain('ANALYSIS');
    expect(html).toContain('OUTPUT');
    expect(html).toContain('SYSTEM');

    // Nav items
    expect(html).toContain('Overview');
    expect(html).toContain('Explorer');
    expect(html).toContain('Search');
    expect(html).toContain('Assistant');
    expect(html).toContain('Dependencies');
    expect(html).toContain('Architecture');
    expect(html).toContain('Code Health');
    expect(html).toContain('Documentation');
    expect(html).toContain('Settings');
  });

  it('renders meaningful status disclosures and metrics in StatusBar', () => {
    const html = renderToString(
      <StatusBar repoPath="summer-project-1" totalFiles={42} totalLines={1234} />
    );

    // Meaningful labels
    expect(html).toContain('Backend');
    expect(html).toContain('files');
    expect(html).toContain('lines');
    expect(html).toContain('42');
    expect(html).toContain('1,234');
  });

  it('does not trigger scanRepo when navigating between routes', () => {
    const scanSpy = vi.fn();
    useWorkspaceStore.setState({
      activeRepository: 'd:/projects/summer-project-1',
      activeRepositoryId: 1,
      scanRepo: scanSpy,
    });

    // Simulate switching active repository route without rescan
    useWorkspaceStore.getState().setActiveRepository('d:/projects/summer-project-1', 1);
    expect(scanSpy).not.toHaveBeenCalled();
  });

  it('ErrorBoundary recovers and clears errors when resetKey changes', async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    let shouldThrow = true;
    function FragileChild() {
      if (shouldThrow) {
        throw new Error('Boom in route');
      }
      return <div>Recovered Component</div>;
    }

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await act(async () => {
      root.render(
        <ErrorBoundary resetKey="/old-route">
          <FragileChild />
        </ErrorBoundary>
      );
    });

    expect(container.innerHTML).toContain('Something went wrong');

    shouldThrow = false;
    await act(async () => {
      root.render(
        <ErrorBoundary resetKey="/new-route">
          <FragileChild />
        </ErrorBoundary>
      );
    });

    expect(container.innerHTML).toContain('Recovered Component');
    expect(container.innerHTML).not.toContain('Something went wrong');

    spy.mockRestore();
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('MainLayout clears workspace and redirects to /app if repository returns 404', async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ detail: 'Not found' }),
    } as any);

    useWorkspaceStore.setState({
      activeRepository: '/deleted/repo',
      activeRepositoryId: 999,
    });

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/app/repositories/999/explorer']}>
          <MainLayout />
        </MemoryRouter>
      );
    });

    expect(useWorkspaceStore.getState().activeRepositoryId).toBeNull();
    expect(useWorkspaceStore.getState().activeRepository).toBeNull();

    fetchMock.mockRestore();
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('useRepoNavigate constructs scoped repo URLs when active, otherwise falls back to /app', () => {
    let navigateResult = '';
    function TestComponent() {
      const { buildRepoUrl } = useRepoNavigate();
      navigateResult = buildRepoUrl('graph');
      return null;
    }

    useWorkspaceStore.setState({ activeRepositoryId: 42 });
    renderToString(
      <MemoryRouter initialEntries={['/app/repositories/42/explorer']}>
        <TestComponent />
      </MemoryRouter>
    );
    expect(navigateResult).toBe('/app/repositories/42/graph');

    useWorkspaceStore.setState({ activeRepositoryId: null });
    renderToString(
      <MemoryRouter initialEntries={['/']}>
        <TestComponent />
      </MemoryRouter>
    );
    expect(navigateResult).toBe('/app');
  });
  it('B2: mounts MainLayout at /app/repositories/42/overview and calls getUserRepository exactly once', async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const mockRepo: SavedRepository = {
      id: 42,
      name: 'dedup-repo',
      source_path: '/repos/dedup-repo',
      source_type: 'local',
      status: 'READY',
      file_count: 5,
      total_files: 5,
      total_lines: 100,
      language: 'TypeScript',
      languages: { TypeScript: 5 },
      created_at: '2026-01-01',
    };

    const getUserRepoSpy = vi.spyOn(repoService, 'getUserRepository').mockResolvedValue(mockRepo);

    useWorkspaceStore.setState({
      activeRepository: null,
      activeRepositoryId: null,
    });

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/app/repositories/42/overview']}>
          <MainLayout />
        </MemoryRouter>
      );
    });

    expect(getUserRepoSpy).toHaveBeenCalledTimes(1);
    expect(getUserRepoSpy).toHaveBeenCalledWith(42);

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
