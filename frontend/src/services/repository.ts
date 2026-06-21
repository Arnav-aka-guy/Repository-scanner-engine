import { apiGet, apiPost } from './api';
import { RepositoryInfo, FileInfo } from '../types/repository';

export async function scanRepository(path: string): Promise<RepositoryInfo> {
  return apiPost<RepositoryInfo>('/repository/scan', { path });
}

export async function listFiles(repoPath: string): Promise<FileInfo[]> {
  return apiGet<FileInfo[]>('/repository/files', { repo_path: repoPath });
}

export async function getFile(filePath: string): Promise<{
  file_path: string;
  content: string;
  language: string;
  entities: any[];
}> {
  // Don't use encodeURIComponent — it encodes slashes (%2F) which breaks
  // FastAPI's {file_path:path} parameter. Just pass the raw path.
  return apiGet<any>(`/repository/file/${filePath}`);
}
