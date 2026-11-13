import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useWorkspaceStore } from '../stores/workspaceStore';
import * as graphService from '../services/graph';
import * as searchService from '../services/search';
import * as repoService from '../services/repository';
import * as docService from '../services/documentation';

describe('B10 Race Conditions & Repository Isolation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useWorkspaceStore.getState().clearWorkspace({ silent: true });
  });

  it('ignores graphData from late-resolving fetchGraph when repository switches', async () => {
    let resolveGraph: (value: any) => void = () => {};
    const deferredPromise = new Promise((resolve) => {
      resolveGraph = resolve;
    });

    vi.spyOn(graphService, 'getDependencyGraph').mockReturnValue(deferredPromise as any);

    // Active repo is 1
    useWorkspaceStore.setState({ activeRepository: '/path/repo-1', activeRepositoryId: 1 });

    // Start fetchGraph for repo 1
    const fetchPromise = useWorkspaceStore.getState().fetchGraph('dependency');

    // Switch active repo to 2 before fetch resolves
    useWorkspaceStore.setState({
      activeRepository: '/path/repo-2',
      activeRepositoryId: 2,
      graphData: null,
    });

    // Resolve the late graph for repo 1
    resolveGraph({ nodes: [{ id: 'late-node-from-repo-1' }], edges: [] });
    await fetchPromise;

    // Verify graphData was NOT overwritten with repo 1's data
    expect(useWorkspaceStore.getState().graphData).toBeNull();
  });

  it('ignores searchResults from late-resolving searchCode when repository switches', async () => {
    let resolveSearch: (value: any) => void = () => {};
    const deferredPromise = new Promise((resolve) => {
      resolveSearch = resolve;
    });

    vi.spyOn(searchService, 'semanticSearch').mockReturnValue(deferredPromise as any);

    useWorkspaceStore.setState({ activeRepository: '/path/repo-1', activeRepositoryId: 1 });

    const searchPromise = useWorkspaceStore.getState().searchCode('query', 10);

    // Switch repo to 2
    useWorkspaceStore.setState({
      activeRepository: '/path/repo-2',
      activeRepositoryId: 2,
      searchResults: [],
    });

    // Resolve old search
    resolveSearch({
      results: [
        {
          file_path: '/path/repo-1/file.py',
          entity_name: 'late_func',
          entity_type: 'function',
          score: 0.9,
          start_line: 1,
          end_line: 10,
          source_code: 'def late_func(): pass',
          docstring: '',
        },
      ],
      total: 1,
    });
    await searchPromise;

    expect(useWorkspaceStore.getState().searchResults).toHaveLength(0);
  });

  it('ignores loadFileDetail when active repo switches before response arrives', async () => {
    let resolveFile: (value: any) => void = () => {};
    const deferredPromise = new Promise((resolve) => {
      resolveFile = resolve;
    });

    vi.spyOn(repoService, 'getFile').mockReturnValue(deferredPromise as any);

    useWorkspaceStore.setState({ activeRepository: '/path/repo-1', activeRepositoryId: 1 });

    const loadPromise = useWorkspaceStore.getState().loadFileDetail('file.py');

    // Switch repo
    useWorkspaceStore.setState({
      activeRepository: '/path/repo-2',
      activeRepositoryId: 2,
      selectedFileDetail: null,
    });

    resolveFile({
      content: 'old repo content',
      language: 'python',
      entities: [],
    });
    await loadPromise;

    expect(useWorkspaceStore.getState().selectedFileDetail).toBeNull();
  });

  it('ignores generateDocs when active repo switches before response arrives', async () => {
    let resolveDocs: (value: any) => void = () => {};
    const deferredPromise = new Promise((resolve) => {
      resolveDocs = resolve;
    });

    vi.spyOn(docService, 'generateDocumentation').mockReturnValue(deferredPromise as any);

    useWorkspaceStore.setState({ activeRepository: '/path/repo-1', activeRepositoryId: 1 });

    const docsPromise = useWorkspaceStore.getState().generateDocs('markdown');

    useWorkspaceStore.setState({
      activeRepository: '/path/repo-2',
      activeRepositoryId: 2,
      generatedDocs: null,
    });

    resolveDocs({
      docs: { overview: 'old repo doc' },
      modules: 1,
    });
    await docsPromise;

    expect(useWorkspaceStore.getState().generatedDocs).toBeNull();
  });
});
