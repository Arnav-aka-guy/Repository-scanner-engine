import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { RepositoryInfo, FileInfo, FileTreeNode } from '../types/repository';
import { ChatMessage } from '../types/chat';
import { AnalysisResult } from '../types/graph';
import { scanRepository, scanGitHubRepository, listFiles, getFile } from '../services/repository';
import { getDependencyGraph, getCallGraph, getAnalysis } from '../services/graph';
import { semanticSearch, SearchResponse } from '../services/search';
import { sendChatMessageStream } from '../services/chat';
import { generateDocumentation, GenerateDocsResponse } from '../services/documentation';
import { useToastStore } from './toastStore';

interface FileDetail {
  content: string;
  language: string;
  entities: any[];
}

interface WorkspaceState {
  // ── Repository ─────────────────────────────────────────────────────
  activeRepository: string | null;
  repositoryInfo: RepositoryInfo | null;
  files: FileInfo[];
  fileTree: FileTreeNode[];
  selectedFilePath: string | null;
  selectedFileDetail: FileDetail | null;
  scanStatus: 'idle' | 'scanning' | 'indexed' | 'error';
  scanError: string | null;
  fileLoading: boolean;
  recentRepositories: string[];

  // ── Graph ──────────────────────────────────────────────────────────
  graphData: any;
  graphType: 'dependency' | 'call';
  graphLoading: boolean;
  graphError: string | null;
  analysisResult: AnalysisResult | null;

  // ── Search ─────────────────────────────────────────────────────────
  searchResults: any[];
  searchTotal: number;
  lastSearchQuery: string;
  searchLoading: boolean;
  searchError: string | null;

  // ── Chat ───────────────────────────────────────────────────────────
  chatMessages: ChatMessage[];
  chatLoading: boolean;
  chatError: string | null;

  // ── Documentation ──────────────────────────────────────────────────
  generatedDocs: GenerateDocsResponse | null;
  docsLoading: boolean;
  docsError: string | null;

  // ── Actions ────────────────────────────────────────────────────────
  scanRepo: (path: string) => Promise<void>;
  setSelectedFile: (path: string | null) => void;
  loadFileDetail: (path: string) => Promise<void>;
  fetchGraph: (type: 'dependency' | 'call') => Promise<void>;
  runAnalysis: () => Promise<void>;
  searchCode: (query: string, topK?: number) => Promise<void>;
  sendChatMessage: (question: string) => Promise<void>;
  clearChatHistory: () => void;
  generateDocs: (format?: 'markdown' | 'html') => Promise<void>;
  clearWorkspace: () => void;
  selectLocalDirectory: () => Promise<void>;
}

// ── Tree builder helper ──────────────────────────────────────────────

function buildTree(fileList: FileInfo[], rootPath: string): FileTreeNode[] {
  const root: FileTreeNode[] = [];
  const rootPathNormalized = rootPath.replace(/[\\/]+$/, '');

  fileList.forEach((file) => {
    let relativePath = file.path;
    if (relativePath.startsWith(rootPathNormalized)) {
      relativePath = relativePath.slice(rootPathNormalized.length).replace(/^[\\/]+/, '');
    }

    const segments = relativePath.split(/[\\/]+/);
    let currentLevel = root;
    let accumulatedPath = rootPathNormalized;

    segments.forEach((segment, idx) => {
      if (!segment) return;
      accumulatedPath += '/' + segment;
      const isFile = idx === segments.length - 1;
      let existingNode = currentLevel.find((node) => node.name === segment);

      if (!existingNode) {
        existingNode = {
          name: segment,
          path: isFile ? file.path : accumulatedPath,
          type: isFile ? 'file' : 'directory',
          extension: isFile ? file.extension : undefined,
        };
        if (!isFile) {
          existingNode.children = [];
        }
        currentLevel.push(existingNode);
      }

      if (!isFile && existingNode.children) {
        currentLevel = existingNode.children;
      }
    });
  });

  const sortTree = (nodes: FileTreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    nodes.forEach((node) => {
      if (node.children) sortTree(node.children);
    });
  };

  sortTree(root);
  return root;
}

// ── Store ────────────────────────────────────────────────────────────

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      // ── Initial state ──────────────────────────────────────────────
      activeRepository: null,
      repositoryInfo: null,
      files: [],
      fileTree: [],
      selectedFilePath: null,
      selectedFileDetail: null,
      scanStatus: 'idle',
      scanError: null,
      fileLoading: false,
      recentRepositories: [],

      graphData: null,
      graphType: 'dependency',
      graphLoading: false,
      graphError: null,
      analysisResult: null,

      searchResults: [],
      searchTotal: 0,
      lastSearchQuery: '',
      searchLoading: false,
      searchError: null,

      chatMessages: [],
      chatLoading: false,
      chatError: null,

      generatedDocs: null,
      docsLoading: false,
      docsError: null,

      // ── Actions ────────────────────────────────────────────────────

      scanRepo: async (path: string) => {
        if (!path) return;
        set({ scanStatus: 'scanning', scanError: null });
        try {
          const isGitHub =
            path.trim().startsWith('http://') ||
            path.trim().startsWith('https://') ||
            path.trim().includes('github.com');
          const info = isGitHub
            ? await scanGitHubRepository(path.trim())
            : await scanRepository(path.trim());
          const targetPath = info.path;
          const fileList = await listFiles(targetPath);
          const tree = buildTree(fileList, targetPath);

          // Update recent repositories
          const recent = get().recentRepositories.filter((r) => r !== path && r !== targetPath);
          recent.unshift(path);
          if (recent.length > 10) recent.pop();

          set({
            activeRepository: targetPath,
            repositoryInfo: info,
            files: fileList,
            fileTree: tree,
            scanStatus: 'indexed',
            scanError: null,
            selectedFilePath: null,
            selectedFileDetail: null,
            graphData: null,
            analysisResult: null,
            searchResults: [],
            generatedDocs: null,
            recentRepositories: recent,
          });
          useToastStore.getState().addToast({
            type: 'success',
            title: isGitHub ? 'GitHub Repository Cloned & Indexed' : 'Repository Indexed',
            message: `${info.total_files} files indexed (${info.total_lines.toLocaleString()} lines)`,
          });
        } catch (err: any) {
          set({ scanStatus: 'error', scanError: err.message || 'Failed to scan repository.' });
          useToastStore.getState().addToast({
            type: 'error',
            title: 'Scan Failed',
            message: err.message || 'Failed to scan repository.',
          });
        }
      },

      setSelectedFile: (path: string | null) => {
        set({ selectedFilePath: path, selectedFileDetail: null });
        if (path) {
          get().loadFileDetail(path);
        }
      },

      loadFileDetail: async (path: string) => {
        set({ fileLoading: true });
        try {
          const repoPath = get().activeRepository || '';
          const detail = await getFile(path, repoPath);
          set({
            selectedFileDetail: {
              content: detail.content,
              language: detail.language,
              entities: detail.entities,
            },
            fileLoading: false,
          });
        } catch (err: any) {
          set({ fileLoading: false, scanError: `Failed to read file: ${err.message}` });
        }
      },

      fetchGraph: async (type: 'dependency' | 'call') => {
        const repoPath = get().activeRepository;
        if (!repoPath) return;
        set({ graphLoading: true, graphError: null, graphType: type });
        try {
          const data = type === 'dependency'
            ? await getDependencyGraph(repoPath)
            : await getCallGraph(repoPath);
          set({ graphData: data, graphLoading: false });
        } catch (err: any) {
          set({ graphError: err.message || `Failed to fetch ${type} graph.`, graphLoading: false });
        }
      },

      runAnalysis: async () => {
        const repoPath = get().activeRepository;
        if (!repoPath) return;
        set({ graphLoading: true, graphError: null });
        try {
          const result = await getAnalysis(repoPath);
          set({ analysisResult: result, graphLoading: false });
        } catch (err: any) {
          set({ graphError: err.message || 'Failed to analyze repository.', graphLoading: false });
        }
      },

      searchCode: async (query: string, topK: number = 10) => {
        if (!query) return;
        set({ searchLoading: true, searchError: null, lastSearchQuery: query });
        try {
          const repoPath = get().activeRepository || undefined;
          const response: SearchResponse = await semanticSearch(query, topK, repoPath);
          set({

            searchResults: response.results,
            searchTotal: response.total,
            searchLoading: false,
          });
        } catch (err: any) {
          set({ searchError: err.message || 'Search failed.', searchLoading: false });
        }
      },

      sendChatMessage: async (question: string) => {
        const repoPath = get().activeRepository;
        if (!question || !repoPath) return;

        set({ chatLoading: true, chatError: null });

        const userMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'user',
          content: question,
          timestamp: new Date().toLocaleTimeString(),
        };

        const assistantMsgId = crypto.randomUUID();
        const assistantMsg: ChatMessage = {
          id: assistantMsgId,
          role: 'assistant',
          content: '',
          timestamp: new Date().toLocaleTimeString(),
        };

        set((state) => ({
          chatMessages: [...state.chatMessages, userMsg, assistantMsg],
        }));

        try {
          await sendChatMessageStream(
            question,
            repoPath,
            (chunk: string) => {
              set((state) => ({
                chatMessages: state.chatMessages.map((msg) =>
                  msg.id === assistantMsgId
                    ? { ...msg, content: msg.content + chunk }
                    : msg
                ),
              }));
            },
            () => {
              set({ chatLoading: false });
            }
          );
        } catch (err: any) {
          set((state) => ({
            chatError: err.message || 'Error during streaming.',
            chatLoading: false,
            chatMessages: state.chatMessages.map((msg) =>
              msg.id === assistantMsgId
                ? { ...msg, content: msg.content + '\n\n*Error: Failed to stream response.*' }
                : msg
            ),
          }));
        }
      },

      clearChatHistory: () => {
        set({ chatMessages: [], chatError: null });
      },

      generateDocs: async (format: 'markdown' | 'html' = 'markdown') => {
        const repoPath = get().activeRepository;
        if (!repoPath) return;
        set({ docsLoading: true, docsError: null });
        try {
          const docs = await generateDocumentation(repoPath, format);
          set({ generatedDocs: docs, docsLoading: false });
          useToastStore.getState().addToast({
            type: 'success',
            title: 'Documentation Compiled',
            message: `${docs.modules || 0} module references generated.`,
          });
        } catch (err: any) {
          set({ docsError: err.message || 'Failed to generate documentation.', docsLoading: false });
          useToastStore.getState().addToast({
            type: 'error',
            title: 'Documentation Failed',
            message: err.message || 'Failed to generate docs.',
          });
        }
      },

      clearWorkspace: () => {
        set({
          activeRepository: null,
          repositoryInfo: null,
          files: [],
          fileTree: [],
          selectedFilePath: null,
          selectedFileDetail: null,
          scanStatus: 'idle',
          scanError: null,
          graphData: null,
          analysisResult: null,
          searchResults: [],
          chatMessages: [],
          generatedDocs: null,
        });
        useToastStore.getState().addToast({
          type: 'info',
          title: 'Workspace Cleared',
          message: 'All scan data, graphs, and chat history have been reset.',
        });
      },

      selectLocalDirectory: async () => {
        if (window.electronAPI && window.electronAPI.selectDirectory) {
          try {
            const path = await window.electronAPI.selectDirectory();
            if (path) {
              get().scanRepo(path);
            }
          } catch (err: any) {
            set({ scanError: err.message || 'Failed to select directory.' });
          }
        } else {
          set({ scanError: 'Directory selector is only available in the desktop application.' });
        }
      },
    }),
    {
      name: 'antigravity-workspace',
      // Only persist these keys (not loading states or transient data)
      partialize: (state) => ({
        activeRepository: state.activeRepository,
        recentRepositories: state.recentRepositories,
        chatMessages: state.chatMessages.slice(-100),  // Cap at 100 messages
        graphType: state.graphType,
      }),
    }
  )
);
