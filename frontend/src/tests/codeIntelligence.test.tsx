import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { DependencyGraph } from '../pages/DependencyGraph';
import { Overview } from '../pages/Overview';
import { useWorkspaceStore } from '../stores/workspaceStore';
import * as repoService from '../services/repository';
import * as graphService from '../services/graph';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as any;
}

describe('Phase 13: Advanced Code Intelligence', () => {
  let container: HTMLDivElement;
  let root: any;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  it('renders Symbol Graph tab and relationship types', async () => {
    act(() => {
      useWorkspaceStore.setState({
        activeRepository: 'd:/projects/summer-project-1',
        graphLoading: false,
        graphError: null,
        graphData: {
          nodes: [
            { data: { id: 'backend/api/chat.py', label: 'chat.py', node_type: 'file', file_path: 'backend/api/chat.py' } },
            { data: { id: 'backend/retrieval/service.py', label: 'service.py', node_type: 'file', file_path: 'backend/retrieval/service.py' } },
          ],
          edges: [
            { data: { source: 'backend/api/chat.py', target: 'backend/retrieval/service.py', edge_type: 'imports' } },
          ],
        },
      });
    });

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/graph']}>
          <DependencyGraph />
        </MemoryRouter>
      );
    });

    // Check segmented tabs
    expect(container.innerHTML).toContain('How Files Connect');
    expect(container.innerHTML).toContain('Who Calls What?');
    expect(container.innerHTML).toContain('Symbol Graph');
  });

  it('renders Dead Code Confidence items with calibrated score and explanation', async () => {
    act(() => {
      useWorkspaceStore.setState({
        activeRepository: 'd:/projects/summer-project-1',
        graphLoading: false,
        graphError: null,
        analysisResult: {
          dead_code: [],
          dead_code_confidence: [
            {
              node: {
                id: 'calc_unused_hash',
                label: 'calc_unused_hash',
                node_type: 'function',
                file_path: 'backend/utils/helpers.py',
              },
              confidence: 96,
              reason: 'No references found across indexed repository.',
              references_count: 0,
              status: 'Potentially unused',
            },
          ],
          circular_dependencies: [],
          complexity_metrics: {},
        },
      });
    });

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/graph']}>
          <DependencyGraph />
        </MemoryRouter>
      );
    });

    expect(container.innerHTML).toContain('Potentially Unreferenced Code');
    expect(container.innerHTML).toContain('calc_unused_hash');
    expect(container.innerHTML).toContain('96% confidence');
    expect(container.innerHTML).toContain('No references found across indexed repository.');
  });

  it('renders Repository Onboarding Walkthrough on Overview page', async () => {
    const mockGuide: repoService.RepoOnboardingGuide = {
      purpose: 'A developer-oriented codebase intelligence application.',
      architecture_overview: 'Structured into modular REST API controllers, parser engine, and hybrid graph retriever.',
      entry_points: ['backend/main.py', 'frontend/src/main.tsx'],
      important_files: ['backend/graph/builder.py', 'backend/parser/service.py'],
      data_flow: 'Requests flow from FastAPI routers into service layers and graph builders.',
      dependencies_summary: 'Indexed across 42 parsed modules with static call graphs.',
      known_issues: ['Review modules with high coupling in Architecture Health.'],
      starting_points: ['backend/main.py'],
    };

    vi.spyOn(repoService, 'getOnboardingGuide').mockResolvedValue(mockGuide);

    act(() => {
      useWorkspaceStore.setState({
        activeRepository: 'd:/projects/summer-project-1',
        scanStatus: 'indexed',
        repositoryInfo: {
          path: 'd:/projects/summer-project-1',
          name: 'summer-project-1',
          total_files: 45,
          total_lines: 4800,
          languages: { Python: 30, TypeScript: 15 },
          scanned_at: new Date().toISOString(),
        },
      });
    });

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/']}>
          <Overview />
        </MemoryRouter>
      );
    });

    // Check button exists
    const guideButton = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Understand Repository')
    );
    expect(guideButton).toBeDefined();

    // Click to open walkthrough
    await act(async () => {
      guideButton?.click();
    });

    // Verify walkthrough elements are rendered
    expect(container.innerHTML).toContain('Understand this repository');
    expect(container.innerHTML).toContain('A developer-oriented codebase intelligence application.');
    expect(container.innerHTML).toContain('Architecture Overview');
    expect(container.innerHTML).toContain('Data Flow');
    expect(container.innerHTML).toContain('Entry Points (2)');
    expect(container.innerHTML).toContain('Important Files (2)');
    expect(container.innerHTML).toContain('Known Issues / Debt');
    expect(container.innerHTML).toContain('Where Should I Start?');
    expect(container.innerHTML).toContain('Ask AI about this');
  });
});
