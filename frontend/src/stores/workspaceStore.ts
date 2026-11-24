import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { RepositoryInfo, FileInfo, FileTreeNode, SavedRepository } from '../types/repository';
import { ChatMessage } from '../types/chat';
import { AnalysisResult } from '../types/graph';
import { parseServerDate } from '../utils/date';
import { onAuthReset } from './authStore';
import {
  scanGitHubRepository,
  scanRepositoryAsync,
  scanUserRepository,
  getScanJobStatus,
  cancelScanJob,
  subscribeScanEvents,
  browseFolder,
  listFiles,
  getFile,
  getUserRepositories,
  getUserRepository,
  createUserRepository,
  type ScanJob,
} from '../services/repository';
import { getDependencyGraph, getCallGraph, getAnalysis, getSymbolGraph } from '../services/graph';
import { semanticSearch, SearchResponse } from '../services/search';
import { sendChatMessageStream, getChatHistory, clearChatHistoryApi } from '../services/chat';
import { generateDocumentation, GenerateDocsResponse } from '../services/documentation';
import { useToastStore } from './toastStore';

import { CodeEntity } from '../types/repository';
import { GraphData } from '../types/graph';
import { SearchResult } from '../types/chat';
import { HealthScore } from '../components/health/HealthTypes';

interface FileDetail {
  content: string;
  language: string;
  entities: CodeEntity[];
}

interface WorkspaceState {
  // Repository
  activeRepository: string | null;
  activeRepositoryId: number | null;
  repositoryInfo: RepositoryInfo | null;
  files: FileInfo[];
  fileTree: FileTreeNode[];
  selectedFilePath: string | null;
  selectedFileDetail: FileDetail | null;
  scanStatus: 'idle' | 'scanning' | 'indexed' | 'error';
  scanProgress: number;
  scanMessage: string;
  scanError: string | null;
  fileError: string | null;
  fileLoading: boolean;
  currentScanJobId: string | null;
  cancelScan: () => Promise<void>;
  recentRepositories: string[];
  pendingChatMessage: string | null;
  queueChatMessage: (question: string) => void;
  consumePendingChatMessage: () => string | null;

  // Graph
  graphData: GraphData | null;
  graphType: 'dependency' | 'call' | 'symbol';
  graphLoading: boolean;
  graphError: string | null;
  analysisResult: AnalysisResult | null;

  // Search
  searchResults: SearchResult[];
  searchTotal: number;
  lastSearchQuery: string;
  searchLoading: boolean;
  searchError: string | null;

  // Chat
  chatMessages: ChatMessage[];
  chatMessagesByRepo: Record<string, ChatMessage[]>;
  chatLoading: boolean;
  chatError: string | null;
  activeConversationId: string | null;

  // Documentation
  generatedDocs: GenerateDocsResponse | null;
  docsLoading: boolean;
  docsError: string | null;

  // Health Cache
  cachedHealthScore: Record<string, HealthScore>;
  setCachedHealthScore: (repoPath: string, score: HealthScore) => void;

  // Actions
  setActiveRepository: (path: string, repoId?: number | null) => void;
  openRepository: (repo: SavedRepository) => Promise<void>;
  scanRepo: (path: string, repoId?: number | null) => Promise<void>;
  setSelectedFile: (path: string | null) => void;
  loadFileDetail: (path: string) => Promise<void>;
  fetchGraph: (type: 'dependency' | 'call' | 'symbol') => Promise<void>;
  runAnalysis: () => Promise<void>;
  searchCode: (query: string, topK?: number) => Promise<void>;
  sendChatMessage: (question: string) => Promise<void>;
  loadPersistentChatHistory: () => Promise<void>;
  clearChatHistory: () => void;
  generateDocs: (format?: 'markdown' | 'html') => Promise<void>;
  clearWorkspace: (options?: { silent?: boolean }) => void;
  selectLocalDirectory: () => Promise<void>;
  isRepoModalOpen: boolean;
  setRepoModalOpen: (open: boolean) => void;
}

// Tree builder helper

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

// Store


// Multi-user isolated workspace storage

export function getWorkspaceStorageKey(): string {
  try {
    const authData = localStorage.getItem('antigravity-auth');
    if (authData) {
      const parsed = JSON.parse(authData);
      const userId = parsed?.state?.user?.id;
      if (userId !== undefined && userId !== null) {
        return `antigravity-workspace:user-${userId}`;
      }
    }
  } catch {
    // fallback
  }
  return 'antigravity-workspace:local';
}

const userNamespacedStorage = {
  getItem: (_name: string): string | null => {
    try {
      return localStorage.getItem(getWorkspaceStorageKey());
    } catch {
      return null;
    }
  },
  setItem: (_name: string, value: string): void => {
    try {
      localStorage.setItem(getWorkspaceStorageKey(), value);
    } catch {
      // ignore quota errors
    }
  },
  removeItem: (_name: string): void => {
    try {
      localStorage.removeItem(getWorkspaceStorageKey());
    } catch {
      // ignore
    }
  },
};

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      // Initial state
      activeRepository: null,
      activeRepositoryId: null,
      repositoryInfo: null,
      files: [],
      fileTree: [],
      selectedFilePath: null,
      selectedFileDetail: null,
      scanStatus: 'idle',
      scanProgress: 0,
      scanMessage: '',
      scanError: null,
      fileError: null,
      fileLoading: false,
      currentScanJobId: null,
      recentRepositories: [],
      cancelScan: async () => {
        const jobId = get().currentScanJobId;
        if (jobId) {
          try {
            await cancelScanJob(jobId);
          } catch (err) {
            console.warn('Failed to cancel scan job:', err);
          }
        }
        set({
          scanStatus: 'idle',
          scanProgress: 0,
          scanMessage: 'Scan cancelled.',
          currentScanJobId: null,
        });
        useToastStore.getState().addToast({
          type: 'info',
          title: 'Scan Cancelled',
          message: 'The repository scan job was stopped.',
        });
      },
      pendingChatMessage: null,
      queueChatMessage: (question: string) => set({ pendingChatMessage: question }),
      consumePendingChatMessage: () => {
        const pending = get().pendingChatMessage;
        if (pending) {
          set({ pendingChatMessage: null });
        }
        return pending;
      },
      isRepoModalOpen: false,

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
      chatMessagesByRepo: {},
      chatLoading: false,
      chatError: null,
      activeConversationId: null,

      generatedDocs: null,
      docsLoading: false,
      docsError: null,

      // Health Cache
      cachedHealthScore: {},
      setCachedHealthScore: (repoPath: string, score: HealthScore) =>
        set((s) => ({
          cachedHealthScore: { ...s.cachedHealthScore, [repoPath]: score },
        })),

      // Actions

      setActiveRepository: (path: string, repoId: number | null = null) => {
        const normPath = path ? path.replace(/\\/g, '/').replace(/\/+$/, '') : null;
        set({
          activeRepository: normPath,
          activeRepositoryId: repoId,
        });
      },

      openRepository: async (repo: SavedRepository) => {
        const rawDiskPath = repo.path || repo.source_path || '';
        const diskPath = rawDiskPath ? rawDiskPath.replace(/\\/g, '/').replace(/\/+$/, '') : '';

        let mappedStatus: 'idle' | 'scanning' | 'indexed' | 'error' = 'idle';
        if (repo.status === 'READY') mappedStatus = 'indexed';
        else if (repo.status === 'SCANNING') mappedStatus = 'scanning';
        else if (repo.status === 'FAILED') mappedStatus = 'error';
        else mappedStatus = 'idle';

        const repoInfo: RepositoryInfo = {
          path: diskPath,
          name: repo.name,
          source_path: repo.source_path,
          source_type: repo.source_type,
          total_files: repo.total_files ?? repo.file_count ?? 0,
          total_lines: repo.total_lines ?? 0,
          languages: repo.languages || {},
          scanned_at: repo.last_scanned_at || new Date().toISOString(),
        };

        const recent = diskPath
          ? [diskPath, ...get().recentRepositories.filter((p) => p !== diskPath)].slice(0, 5)
          : get().recentRepositories;

        set({
          activeRepository: diskPath,
          activeRepositoryId: repo.id,
          repositoryInfo: repoInfo,
          files: [],
          fileTree: [],
          selectedFilePath: null,
          selectedFileDetail: null,
          scanStatus: mappedStatus,
          scanProgress: mappedStatus === 'indexed' ? 1.0 : (mappedStatus === 'scanning' ? 0.5 : 0),
          scanMessage: mappedStatus === 'indexed' ? 'Ready' : '',
          scanError: null,
          recentRepositories: recent,
          graphData: null,
          graphLoading: false,
          graphError: null,
          analysisResult: null,
          searchResults: [],
          lastSearchQuery: '',
          searchLoading: false,
          searchError: null,
          chatMessages: [],
          chatLoading: false,
          chatError: null,
          generatedDocs: null,
          docsLoading: false,
          docsError: null,
        });

        if (repo.status === 'READY' && diskPath) {
          try {
            const fileList = await listFiles(diskPath, repo.id);
            if (get().activeRepositoryId === repo.id) {
              set({
                files: fileList,
                fileTree: buildTree(fileList, diskPath),
              });
            }
          } catch (err) {
            console.error('Failed to preload file list on openRepository:', err);
          }
        }
      },

      scanRepo: async (path: string, repoId: number | null = null) => {
        if (!path) return;
        // In-flight guard: prevent duplicate concurrent scans
        if (get().scanStatus === 'scanning') return;

        const normInputPath = path.trim().replace(/\\/g, '/').replace(/\/+$/, '');
        let resolvedRepoId: number | null = repoId;

        // If repoId is not provided, look up or create a saved repository for this path
        if (resolvedRepoId == null) {
          try {
            const listRes = await getUserRepositories();
            const existing = (listRes.repositories || []).find((r) => {
              const rSource = r.source_path ? r.source_path.replace(/\\/g, '/').replace(/\/+$/, '') : '';
              const rPath = r.path ? r.path.replace(/\\/g, '/').replace(/\/+$/, '') : '';
              return rSource === normInputPath || rPath === normInputPath;
            });
            if (existing) {
              resolvedRepoId = existing.id;
            } else {
              const basename = normInputPath.split('/').pop() || 'repository';
              const isGitHub =
                normInputPath.startsWith('http://') ||
                normInputPath.startsWith('https://') ||
                normInputPath.includes('github.com');
              const newRepo = await createUserRepository({
                name: basename,
                source_path: normInputPath,
                source_type: isGitHub ? 'github' : 'local',
              });
              resolvedRepoId = newRepo.id;
            }
          } catch (err: any) {
            const msg = err?.message || 'Failed to initialize repository record.';
            set({
              scanStatus: 'error',
              scanError: msg,
              scanMessage: msg,
            });
            useToastStore.getState().addToast({ type: 'error', title: 'Repository Error', message: msg });
            return;
          }
        }

        set({
          scanStatus: 'scanning',
          scanProgress: 0.1,
          scanMessage: 'Starting scan job...',
          scanError: null,
        });

        try {
          const isGitHub =
            normInputPath.startsWith('http://') ||
            normInputPath.startsWith('https://') ||
            normInputPath.includes('github.com');

          let info: RepositoryInfo;

          if (isGitHub && resolvedRepoId == null) {
            info = await scanGitHubRepository(normInputPath);
          } else {
            // Queue async background job with SSE progress streaming and polling fallback.
            // When repository_id is known, use the canonical /api/repositories/{id}/scan endpoint;
            // fall back to path-based scanRepositoryAsync only when no database ID exists.
            let job: { job_id: string };
            try {
              job =
                resolvedRepoId != null
                  ? await scanUserRepository(resolvedRepoId)
                  : await scanRepositoryAsync(normInputPath);
            } catch {
              job = await scanRepositoryAsync(normInputPath);
            }
            set({ currentScanJobId: job.job_id });
            info = await new Promise<RepositoryInfo>((resolve, reject) => {
              let settled = false;
              let sseActive = true;
              let lastProgressTime = Date.now();
              let lastProgressValue = -1;
              let lastProgressMsg = '';
              let watchdogTimer: ReturnType<typeof setInterval> | null = null;

              const cleanup = () => {
                settled = true;
                if (watchdogTimer) clearInterval(watchdogTimer);
                unsubscribe();
              };

              const handleJobUpdate = (progressJob: ScanJob) => {
                if (progressJob.progress !== lastProgressValue || progressJob.message !== lastProgressMsg) {
                  lastProgressTime = Date.now();
                  lastProgressValue = progressJob.progress;
                  lastProgressMsg = progressJob.message;
                }
                set({
                  scanProgress: progressJob.progress,
                  scanMessage: progressJob.message,
                });
                if (progressJob.status === 'completed' && progressJob.result) {
                  cleanup();
                  resolve(progressJob.result);
                } else if (progressJob.status === 'failed') {
                  cleanup();
                  reject(new Error(progressJob.error || progressJob.message || 'Scan failed'));
                } else if (progressJob.status === 'cancelled') {
                  cleanup();
                  reject(new Error('Scan cancelled by user'));
                }
              };

              const unsubscribe = subscribeScanEvents(
                job.job_id,
                handleJobUpdate,
                (status) => {
                  if (status !== 'completed' && status !== 'done' && !settled) {
                    cleanup();
                    reject(new Error(`Scan terminated with status: ${status}`));
                  }
                },
                (err) => {
                  sseActive = false;
                  console.warn('Scan SSE streaming disconnected, falling back to polling', err);
                }
              );

              // Watchdog: poll ONLY when SSE is inactive or quiet for > 3 seconds,
              // and timeout only if no progress occurs for 5 minutes (300,000 ms).
              watchdogTimer = setInterval(async () => {
                if (settled) return;

                if (Date.now() - lastProgressTime > 300000) {
                  cleanup();
                  reject(new Error('Scan job stalled with no progress for 5 minutes'));
                  return;
                }

                if (!sseActive || Date.now() - lastProgressTime > 3000) {
                  try {
                    const statusJob = await getScanJobStatus(job.job_id);
                    handleJobUpdate(statusJob);
                  } catch {
                    // transient polling error
                  }
                }
              }, 1000);
            });
          }

          const targetPath = (info.path || normInputPath).replace(/\\/g, '/').replace(/\/+$/, '');
          const fileList = await listFiles(targetPath);
          const tree = buildTree(fileList, targetPath);

          // Update recent repositories
          const recent = get().recentRepositories.filter((r) => r !== path && r !== targetPath);
          recent.unshift(targetPath);
          if (recent.length > 10) recent.pop();

          let repoDisplayName = info.name;
          let repoSourcePath = isGitHub ? normInputPath : undefined;
          let repoSourceType = isGitHub ? 'github' : 'local';
          if (resolvedRepoId != null) {
            try {
              const saved = await getUserRepository(resolvedRepoId);
              if (saved?.name) repoDisplayName = saved.name;
              if (saved?.source_path) repoSourcePath = saved.source_path;
              if (saved?.source_type) repoSourceType = saved.source_type;
            } catch {}
          }
          const finalInfo: RepositoryInfo = {
            ...info,
            name: repoDisplayName,
            source_path: repoSourcePath,
            source_type: repoSourceType,
          };

          const repoChat = get().chatMessagesByRepo[targetPath] || [];
          set({
            activeRepository: targetPath,
            activeRepositoryId: resolvedRepoId,
            repositoryInfo: finalInfo,
            files: fileList,
            fileTree: tree,
            scanStatus: 'indexed',
            scanProgress: 1.0,
            scanMessage: 'Scan complete.',
            scanError: null,
            selectedFilePath: null,
            selectedFileDetail: null,
            graphData: null,
            analysisResult: null,
            searchResults: [],
            chatMessages: repoChat,
            generatedDocs: null,
            recentRepositories: recent,
          });
          set({ currentScanJobId: null });
          useToastStore.getState().addToast({
            type: 'success',
            title: isGitHub ? 'GitHub Repository Cloned & Indexed' : 'Repository Indexed',
            message: `${info.total_files} files indexed (${info.total_lines.toLocaleString()} lines)`,
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Failed to scan repository.';
          set({
            scanStatus: 'error',
            scanProgress: 0,
            scanMessage: '',
            scanError: msg,
          });
          set({ currentScanJobId: null });
          useToastStore.getState().addToast({
            type: 'error',
            title: 'Scan Failed',
            message: msg,
          });
        }
      },

      setSelectedFile: (path: string | null) => {
        set({ selectedFilePath: path, selectedFileDetail: null, fileError: null });
        if (path) {
          get().loadFileDetail(path);
        }
      },

      loadFileDetail: async (path: string) => {
        const targetRepoId = get().activeRepositoryId;
        const targetRepoPath = get().activeRepository;
        set({ fileLoading: true });
        try {
          const detail = await getFile(path, targetRepoPath || '', targetRepoId);
          if (get().activeRepositoryId !== targetRepoId || get().activeRepository !== targetRepoPath) return;
          set({
            selectedFileDetail: {
              content: detail.content,
              language: detail.language,
              entities: detail.entities,
            },
            fileLoading: false,
          });
        } catch (err: unknown) {
          if (get().activeRepositoryId !== targetRepoId || get().activeRepository !== targetRepoPath) return;
          const msg = err instanceof Error ? err.message : 'Unknown error';
          set({ fileLoading: false, fileError: `Failed to read file: ${msg}` });
        }
      },

      fetchGraph: async (type: 'dependency' | 'call' | 'symbol') => {
        const repoPath = get().activeRepository;
        const targetRepoId = get().activeRepositoryId;
        if (!repoPath) return;
        set({ graphLoading: true, graphError: null, graphType: type });
        try {
          let data;
          if (type === 'dependency') {
            data = await getDependencyGraph(repoPath, targetRepoId);
          } else if (type === 'call') {
            data = await getCallGraph(repoPath, targetRepoId);
          } else {
            data = await getSymbolGraph(repoPath, targetRepoId);
          }
          if (get().activeRepositoryId !== targetRepoId || get().activeRepository !== repoPath) return;
          set({ graphData: data, graphLoading: false });
        } catch (err: unknown) {
          if (get().activeRepositoryId !== targetRepoId || get().activeRepository !== repoPath) return;
          const msg = err instanceof Error ? err.message : `Failed to fetch ${type} graph.`;
          set({ graphError: msg, graphLoading: false });
        }
      },

      runAnalysis: async () => {
        const repoPath = get().activeRepository;
        const targetRepoId = get().activeRepositoryId;
        if (!repoPath) return;
        set({ graphLoading: true, graphError: null });
        try {
          const result = await getAnalysis(repoPath, targetRepoId);
          if (get().activeRepositoryId !== targetRepoId || get().activeRepository !== repoPath) return;
          set({ analysisResult: result, graphLoading: false });
        } catch (err: unknown) {
          if (get().activeRepositoryId !== targetRepoId || get().activeRepository !== repoPath) return;
          const msg = err instanceof Error ? err.message : 'Failed to analyze repository.';
          set({ graphError: msg, graphLoading: false });
        }
      },

      searchCode: async (query: string, topK: number = 10) => {
        if (!query) return;
        const targetRepoId = get().activeRepositoryId;
        const repoPath = get().activeRepository || undefined;
        set({ searchLoading: true, searchError: null, lastSearchQuery: query });
        try {
          const response: SearchResponse = await semanticSearch(query, topK, repoPath, targetRepoId);
          if (get().activeRepositoryId !== targetRepoId) return;
          set({
            searchResults: response.results,
            searchTotal: response.total,
            searchLoading: false,
          });
        } catch (err: unknown) {
          if (get().activeRepositoryId !== targetRepoId) return;
          const msg = err instanceof Error ? err.message : 'Search failed.';
          set({ searchError: msg, searchLoading: false });
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

        set((state) => {
          const next = [...state.chatMessages, userMsg, assistantMsg];
          return {
            chatMessages: next,
            chatMessagesByRepo: {
              ...state.chatMessagesByRepo,
              [repoPath]: next.slice(-100),
            },
          };
        });

        try {
          const convId = get().activeConversationId || undefined;
          await sendChatMessageStream(
            question,
            repoPath,
            (chunk: string) => {
              set((state) => {
                const next = state.chatMessages.map((msg) =>
                  msg.id === assistantMsgId ? { ...msg, content: msg.content + chunk } : msg
                );
                return {
                  chatMessages: next,
                  chatMessagesByRepo: {
                    ...state.chatMessagesByRepo,
                    [repoPath]: next.slice(-100),
                  },
                };
              });
            },
            () => {
              set({ chatLoading: false });
            },
            convId,
            (donePayload) => {
              if (donePayload && donePayload.sources && Array.isArray(donePayload.sources)) {
                set((state) => {
                  const next = state.chatMessages.map((msg) =>
                    msg.id === assistantMsgId ? { ...msg, sources: donePayload.sources as SearchResult[] } : msg
                  );
                  return {
                    chatMessages: next,
                    chatMessagesByRepo: {
                      ...state.chatMessagesByRepo,
                      [repoPath]: next.slice(-100),
                    },
                  };
                });
              }
            },
            get().activeRepositoryId
          );
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Error during streaming.';
          set((state) => {
            const next = state.chatMessages.map((msgItem) =>
              msgItem.id === assistantMsgId
                ? { ...msgItem, content: msgItem.content + '\n\n*Error: Failed to stream response.*' }
                : msgItem
            );
            return {
              chatError: msg,
              chatLoading: false,
              chatMessages: next,
              chatMessagesByRepo: {
                ...state.chatMessagesByRepo,
                [repoPath]: next.slice(-100),
              },
            };
          });
        }
      },

      loadPersistentChatHistory: async () => {
        const repoPath = get().activeRepository;
        const targetRepoId = get().activeRepositoryId;
        if (!repoPath) return;
        try {
          const history = await getChatHistory(repoPath, get().activeConversationId || undefined, targetRepoId);
          if (get().activeRepositoryId !== targetRepoId || get().activeRepository !== repoPath) return;
          if (history && history.length > 0) {
            const msgs: ChatMessage[] = [];
            history.forEach((h, idx) => {
              const timeStr = parseServerDate(h.timestamp)?.toLocaleTimeString() || h.timestamp;
              msgs.push({
                id: `hist-q-${idx}-${h.timestamp}`,
                role: 'user',
                content: h.question,
                timestamp: timeStr,
              });
              msgs.push({
                id: `hist-a-${idx}-${h.timestamp}`,
                role: 'assistant',
                content: h.answer,
                timestamp: timeStr,
              });
            });
            set((state) => ({
              chatMessages: msgs,
              chatMessagesByRepo: {
                ...state.chatMessagesByRepo,
                [repoPath]: msgs.slice(-100),
              },
            }));
          }
        } catch (err) {
          if (get().activeRepositoryId !== targetRepoId || get().activeRepository !== repoPath) return;
          console.warn('Could not load persistent chat history:', err);
        }
      },

      clearChatHistory: () => {
        const repoPath = get().activeRepository;
        if (repoPath) {
          clearChatHistoryApi(repoPath, get().activeConversationId || undefined, get().activeRepositoryId).catch(() => {});
        }
        set((state) => ({
          chatMessages: [],
          chatError: null,
          chatMessagesByRepo: repoPath
            ? { ...state.chatMessagesByRepo, [repoPath]: [] }
            : state.chatMessagesByRepo,
        }));
      },

      generateDocs: async (format: 'markdown' | 'html' = 'markdown') => {
        const repoPath = get().activeRepository;
        const targetRepoId = get().activeRepositoryId;
        if (!repoPath) return;
        set({ docsLoading: true, docsError: null });
        try {
          const docs = await generateDocumentation(repoPath, format, targetRepoId);
          if (get().activeRepositoryId !== targetRepoId || get().activeRepository !== repoPath) return;
          set({ generatedDocs: docs, docsLoading: false });
          useToastStore.getState().addToast({
            type: 'success',
            title: 'Documentation Compiled',
            message: `${docs.modules || 0} module references generated.`,
          });
        } catch (err: unknown) {
          if (get().activeRepositoryId !== targetRepoId || get().activeRepository !== repoPath) return;
          const msg = err instanceof Error ? err.message : 'Failed to generate docs.';
          set({ docsError: msg, docsLoading: false });
          useToastStore.getState().addToast({
            type: 'error',
            title: 'Documentation Failed',
            message: msg,
          });
        }
      },

      clearWorkspace: (options?: { silent?: boolean }) => {
        set({
          activeRepository: null,
          activeRepositoryId: null,
          repositoryInfo: null,
          files: [],
          fileTree: [],
          selectedFilePath: null,
          selectedFileDetail: null,
          scanStatus: 'idle',
          scanProgress: 0,
          scanMessage: '',
          scanError: null,
          fileError: null,
          currentScanJobId: null,
          pendingChatMessage: null,
          recentRepositories: [],
          graphData: null,
          analysisResult: null,
          searchResults: [],
          chatMessages: [],
          chatMessagesByRepo: {},
          generatedDocs: null,
        });
        if (!options?.silent) {
          useToastStore.getState().addToast({
            type: 'info',
            title: 'Workspace Cleared',
            message: 'All scan data, graphs, and chat history have been reset.',
          });
        }
      },

      setRepoModalOpen: (open: boolean) => {
        set({ isRepoModalOpen: open });
      },

      selectLocalDirectory: async () => {
        if (window.electronAPI && window.electronAPI.selectDirectory) {
          try {
            const path = await window.electronAPI.selectDirectory();
            if (path) {
              await get().scanRepo(path);
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Failed to select directory.';
            set({ scanError: msg });
          }
        } else {
          try {
            const res = await browseFolder();
            if (res && res.path) {
              await get().scanRepo(res.path);
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Failed to select directory.';
            set({ scanError: msg });
          }
        }
      },
    }),
    {
      name: 'antigravity-workspace',
      storage: createJSONStorage(() => userNamespacedStorage),
      // Only persist these keys (not loading states or transient data)
      partialize: (state) => ({
        activeRepository: state.activeRepository,
        activeRepositoryId: state.activeRepositoryId,
        recentRepositories: state.recentRepositories,
        chatMessagesByRepo: state.chatMessagesByRepo,
        graphType: state.graphType,
      }),
    }
  )
);

onAuthReset(() => {
  useWorkspaceStore.getState().clearWorkspace({ silent: true });
  try {
    (useWorkspaceStore as any).persist?.rehydrate();
  } catch {}
});
