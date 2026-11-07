import { apiGet, apiPost, apiPatch, apiDelete } from './api';
import { useAuthStore } from '../stores/authStore';
import { RepositoryInfo, FileInfo, SavedRepository, RepositoryListResponse, CodeEntity } from '../types/repository';

export async function scanRepository(path: string): Promise<RepositoryInfo> {
  return apiPost<RepositoryInfo>('/repository/scan', { path });
}

export async function scanGitHubRepository(url: string): Promise<RepositoryInfo> {
  return apiPost<RepositoryInfo>('/repository/scan-github', { url });
}

export async function browseFolder(): Promise<{ path: string }> {
  return apiPost<{ path: string }>('/repository/browse-folder', {});
}

export async function listFiles(
  repoPath?: string | null,
  repoId?: number | null
): Promise<FileInfo[]> {
  const params: Record<string, any> = {};
  if (repoId != null) {
    params.repository_id = repoId;
  } else if (repoPath) {
    params.repo_path = repoPath;
  }
  return apiGet<FileInfo[]>('/repository/files', params);
}

export interface ScanJob {
  job_id: string;
  status: 'pending' | 'scanning' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  message: string;
  result?: RepositoryInfo | null;
  error?: string | null;
  repo_path?: string;
  created_at?: number;
}

export async function scanRepositoryAsync(path: string): Promise<ScanJob> {
  return apiPost<ScanJob>('/repository/scan/async', { path });
}

export async function getScanJobStatus(jobId: string): Promise<ScanJob> {
  return apiGet<ScanJob>(`/repository/scan/jobs/${jobId}`);
}

export function subscribeScanEvents(
  jobId: string,
  onProgress: (job: ScanJob) => void,
  onDone?: (status: string) => void,
  onError?: (err: unknown) => void
): () => void {
  const controller = new AbortController();
  let closed = false;

  const run = async () => {
    try {
      const token = useAuthStore.getState().token;
      const headers: Record<string, string> = {
        Accept: 'text/event-stream',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`/api/repository/scan/jobs/${encodeURIComponent(jobId)}/events`, {
        headers,
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`SSE failed with HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error('Response body is not readable');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (!closed) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let boundaryIndex = buffer.indexOf('\n\n');
        while (boundaryIndex !== -1) {
          const rawBlock = buffer.slice(0, boundaryIndex);
          buffer = buffer.slice(boundaryIndex + 2);
          boundaryIndex = buffer.indexOf('\n\n');

          const lines = rawBlock.split('\n');
          let currentEvent = 'message';
          const dataLines: string[] = [];

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('event:')) {
              currentEvent = trimmed.slice(6).trim();
            } else if (trimmed.startsWith('data:')) {
              dataLines.push(trimmed.slice(5).trim());
            }
          }

          if (dataLines.length > 0) {
            const rawData = dataLines.join('\n');
            try {
              const data = JSON.parse(rawData);
              if (currentEvent === 'progress') {
                onProgress(data as ScanJob);
              } else if (currentEvent === 'done') {
                if (onDone) onDone(data.status || 'completed');
                closed = true;
                return;
              } else if (currentEvent === 'error') {
                if (onError) onError(new Error(data.error || 'Scan job error'));
                closed = true;
                return;
              }
            } catch (parseErr) {
              console.warn('Failed parsing SSE data', parseErr, rawData);
            }
          }
        }
      }

      if (!closed && onDone) {
        onDone('completed');
      }
    } catch (err: unknown) {
      if (!closed) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        if (onError) onError(err);
      }
    }
  };

  run();

  return () => {
    closed = true;
    controller.abort();
  };
}

export async function getFile(
  filePath: string,
  repoPath?: string | null,
  repositoryId?: number | null
): Promise<{
  file_path: string;
  content: string;
  language: string;
  entities: CodeEntity[];
}> {
  const safePath = filePath
    .replace(/\\/g, '/')
    .split('/')
    .map(encodeURIComponent)
    .join('/');
  const params: Record<string, string> = {};
  if (repositoryId != null) {
    params.repository_id = String(repositoryId);
  } else if (repoPath) {
    params.repo_path = repoPath;
  }
  return apiGet<{
    file_path: string;
    content: string;
    language: string;
    entities: CodeEntity[];
  }>(`/repository/file/${safePath}`, params);
}

export interface RepoOnboardingGuide {
  purpose: string;
  architecture_overview: string;
  entry_points: string[];
  important_files: string[];
  data_flow: string;
  dependencies_summary: string;
  known_issues: string[];
  starting_points: string[];
}

export async function getOnboardingGuide(
  repoPath: string,
  repositoryId?: number | null
): Promise<RepoOnboardingGuide> {
  const params: Record<string, string> = {};
  if (repositoryId != null) {
    params.repository_id = String(repositoryId);
  }
  if (repoPath) {
    params.repo_path = repoPath;
  }
  return apiGet<RepoOnboardingGuide>('/repository/onboarding', params);
}

export async function getUserRepositories(): Promise<RepositoryListResponse> {
  return apiGet<RepositoryListResponse>('/repositories');
}

export async function createUserRepository(data: {
  name: string;
  source_path: string;
  source_type?: string;
  description?: string;
}): Promise<SavedRepository> {
  return apiPost<SavedRepository>('/repositories', data);
}

const inFlightRepoRequests = new Map<number, Promise<SavedRepository>>();

export async function getUserRepository(id: number): Promise<SavedRepository> {
  const existing = inFlightRepoRequests.get(id);
  if (existing) {
    return existing;
  }
  const promise = apiGet<SavedRepository>(`/repositories/${id}`).finally(() => {
    inFlightRepoRequests.delete(id);
  });
  inFlightRepoRequests.set(id, promise);
  return promise;
}

export async function updateUserRepository(
  id: number,
  data: { name?: string; description?: string }
): Promise<SavedRepository> {
  return apiPatch<SavedRepository>(`/repositories/${id}`, data);
}

export async function deleteUserRepository(id: number): Promise<{ status: string; message: string }> {
  return apiDelete<{ status: string; message: string }>(`/repositories/${id}`);
}

export interface ScanJobTriggerResponse {
  job_id: string;
  status: string;
  message: string;
  repository_id: number;
}

export async function scanUserRepository(id: number): Promise<ScanJobTriggerResponse> {
  return apiPost<ScanJobTriggerResponse>(`/repositories/${id}/scan`, {});
}


export async function cancelScanJob(jobId: string): Promise<ScanJob> {
  return apiPost<ScanJob>(`/repository/scan/jobs/${jobId}/cancel`, {});
}
