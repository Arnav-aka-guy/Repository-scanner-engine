import { apiGet, apiPost } from './api';
import { RepositoryInfo, FileInfo } from '../types/repository';

export async function scanRepository(path: string): Promise<RepositoryInfo> {
  return apiPost<RepositoryInfo>('/repository/scan', { path });
}

export async function scanGitHubRepository(url: string): Promise<RepositoryInfo> {
  return apiPost<RepositoryInfo>('/repository/scan-github', { url });
}

export async function browseFolder(): Promise<{ path: string }> {
  return apiPost<{ path: string }>('/repository/browse-folder', {});
}

export async function listFiles(repoPath: string): Promise<FileInfo[]> {
  return apiGet<FileInfo[]>('/repository/files', { repo_path: repoPath });
}

export interface ScanJob {
  job_id: string;
  status: 'pending' | 'scanning' | 'completed' | 'failed';
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

export async function listScanJobs(repoPath?: string): Promise<ScanJob[]> {
  const params: Record<string, string> = {};
  if (repoPath) {
    params.repo_path = repoPath;
  }
  return apiGet<ScanJob[]>('/repository/scan/jobs', params);
}

export async function getFile(
  filePath: string,
  repoPath?: string
): Promise<{
  file_path: string;
  content: string;
  language: string;
  entities: any[];
}> {
  // Don't use encodeURIComponent — it encodes slashes (%2F) which breaks
  // FastAPI's {file_path:path} parameter. Just pass the raw path.
  const params: Record<string, string> = {};
  if (repoPath) {
    params.repo_path = repoPath;
  }
  return apiGet<any>(`/repository/file/${filePath}`, params);
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

export async function getOnboardingGuide(repoPath: string): Promise<RepoOnboardingGuide> {
  return apiGet<RepoOnboardingGuide>('/repository/onboarding', { repo_path: repoPath });
}

// ── Multi-user Repository Management ────────────────────────────────────

import { SavedRepository, RepositoryListResponse } from '../types/repository';
import { apiDelete } from './api';

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

export async function getUserRepository(id: number): Promise<SavedRepository> {
  return apiGet<SavedRepository>(`/repositories/${id}`);
}

export async function updateUserRepository(
  id: number,
  data: { name?: string; description?: string }
): Promise<SavedRepository> {
  return apiPost<SavedRepository>(`/repositories/${id}`, data);
}

export async function deleteUserRepository(id: number): Promise<{ status: string; message: string }> {
  return apiDelete<{ status: string; message: string }>(`/repositories/${id}`);
}

export async function scanUserRepository(id: number): Promise<SavedRepository> {
  return apiPost<SavedRepository>(`/repositories/${id}/scan`, {});
}

