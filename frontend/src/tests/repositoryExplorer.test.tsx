import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { RepositoryExplorer } from '../pages/RepositoryExplorer';
import { useWorkspaceStore } from '../stores/workspaceStore';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('Phase 4 Repository Explorer (3-part workspace)', () => {
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

  it('renders empty state when no repository is loaded', async () => {
    act(() => {
      useWorkspaceStore.setState({ activeRepository: null, repositoryInfo: null });
    });

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/explorer']}>
          <RepositoryExplorer />
        </MemoryRouter>
      );
    });

    expect(container.innerHTML).toContain('No Repository Selected');
    expect(container.innerHTML).toContain('Open Overview');
  });

  it('renders 3-part layout (tree, code viewer, symbols/relationships) when repository is loaded', async () => {
    const mockFiles = [
      { name: 'Header.tsx', path: 'd:/projects/demo-repo/src/components/Header.tsx', size: 102, extension: '.tsx' },
      { name: 'api.ts', path: 'd:/projects/demo-repo/src/lib/api.ts', size: 85, extension: '.ts' },
      { name: 'index.ts', path: 'd:/projects/demo-repo/src/index.ts', size: 50, extension: '.ts' },
    ];

    const mockGraph = {
      nodes: [
        { id: 'd:/projects/demo-repo/src/lib/api.ts', label: 'api.ts', type: 'file' },
        { id: 'd:/projects/demo-repo/src/components/Header.tsx', label: 'Header.tsx', type: 'file' },
      ],
      edges: [
        { source: 'd:/projects/demo-repo/src/components/Header.tsx', target: 'd:/projects/demo-repo/src/lib/api.ts', type: 'imports' },
      ],
    };

    const mockFileDetail = {
      content: `import { fetchData } from '../lib/api';\n\nexport function Header() {\n  return <div>Header</div>;\n}\n`,
      language: 'TypeScript',
      entities: [
        { name: 'Header', entity_type: 'function', line_start: 3, line_end: 5 },
      ],
    };

    act(() => {
      useWorkspaceStore.setState({
        activeRepository: 'd:/projects/demo-repo',
        repositoryInfo: {
          path: 'd:/projects/demo-repo',
          name: 'demo-repo',
          total_files: 3,
          total_lines: 450,
          languages: { TypeScript: 3 },
          scanned_at: new Date().toISOString(),
        },
        files: mockFiles as any,
        selectedFilePath: 'd:/projects/demo-repo/src/components/Header.tsx',
        selectedFileDetail: mockFileDetail,
        graphData: mockGraph,
      });
    });

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/explorer']}>
          <RepositoryExplorer />
        </MemoryRouter>
      );
    });

    // 1. Left pane: Explorer header, filter, and file items
    expect(container.innerHTML).toContain('Explorer');
    expect(container.innerHTML).toContain('Filter files...');
    expect(container.innerHTML).toContain('Header.tsx');

    // 2. Center pane: Code viewer with language tag, path, and actions
    expect(container.innerHTML).toContain('TypeScript');
    expect(container.innerHTML).toContain('Copy');
    expect(container.innerHTML).toContain('Ask AI');

    // 3. Right pane: Context inspector tabs and symbol list
    expect(container.innerHTML).toContain('Symbols');
    expect(container.innerHTML).toContain('Relationships');
    expect(container.innerHTML).toContain('Functions');
    expect(container.innerHTML).toContain('Header');
  });
});
