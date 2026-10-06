import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { SemanticSearch } from '../pages/SemanticSearch';
import { DependencyGraph } from '../pages/DependencyGraph';
import { useWorkspaceStore } from '../stores/workspaceStore';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as any;
}

describe('Phase 5 Semantic Search Redesign', () => {
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

  it('renders search header, qualitative match tiers, and filter categories', async () => {
    const mockSearchResults = [
      {
        file_path: 'backend/security/auth.py',
        entity_name: 'get_current_user',
        entity_type: 'function',
        score: 0.72,
        snippet: 'def get_current_user(token: str):\n    return verify_token(token)\n',
        docstring: 'Verifies bearer JWT token.',
        start_line: 14,
        end_line: 22,
      },
    ];

    act(() => {
      useWorkspaceStore.setState({
        activeRepository: 'd:/projects/demo-repo',
        searchResults: mockSearchResults as any,
        searchTotal: 1,
        lastSearchQuery: 'Where is authentication handled?',
      });
    });

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/search']}>
          <SemanticSearch />
        </MemoryRouter>
      );
    });

    // Verify Primary copy and subtext
    expect(container.innerHTML).toContain('Find code by meaning');
    expect(container.innerHTML).toContain('Ask a question or describe what you\'re looking for');

    // Verify Filters exist
    expect(container.innerHTML).toContain('All Results');
    expect(container.innerHTML).toContain('Files');
    expect(container.innerHTML).toContain('Functions');
    expect(container.innerHTML).toContain('Classes');
    expect(container.innerHTML).toContain('API Routes');
    expect(container.innerHTML).toContain('Components');

    // Verify Qualitative Match Strength & reasons
    expect(container.innerHTML).toContain('Strong match');
    expect(container.innerHTML).toContain('get_current_user');
    expect(container.innerHTML).toContain('backend/security/auth.py');

    // Verify Actions
    expect(container.innerHTML).toContain('Open');
    expect(container.innerHTML).toContain('Show dependencies');
    expect(container.innerHTML).toContain('Ask AI');
  });
});

describe('Phase 6 Dependency & Call Graph Redesign', () => {
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

  it('renders main modes (How Files Connect / Who Calls What?), controls, and selected node inspector', async () => {
    const mockGraph = {
      nodes: [
        { id: 'src/components/GlobeView.tsx', label: 'GlobeView.tsx', node_type: 'file', file_path: 'src/components/GlobeView.tsx' },
        { id: 'src/lib/api.ts', label: 'api.ts', node_type: 'file', file_path: 'src/lib/api.ts' },
      ],
      edges: [
        { source: 'src/components/GlobeView.tsx', target: 'src/lib/api.ts', edge_type: 'imports' },
      ],
    };

    act(() => {
      useWorkspaceStore.setState({
        activeRepository: 'd:/projects/demo-repo',
        graphData: mockGraph,
        graphLoading: false,
      });
    });

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/graph']}>
          <DependencyGraph />
        </MemoryRouter>
      );
    });

    // Verify Header explanation & tabs
    expect(container.innerHTML).toContain('How Files Connect');
    expect(container.innerHTML).toContain('Who Calls What?');
    expect(container.innerHTML).toContain('This map shows which parts of your project depend on one another');

    // Verify Controls
    expect(container.innerHTML).toContain('Search nodes in graph...');
    expect(container.innerHTML).toContain('Filter: All Nodes');
    expect(container.innerHTML).toContain('Force-Directed');
    expect(container.innerHTML).toContain('Reset');
  });
});
