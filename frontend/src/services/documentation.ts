import { apiPost } from './api';

export interface GenerateDocsResponse {
  repo_path: string;
  format: string;
  modules: number;
  output_dir: string;
  docs: {
    overview: string;
    architecture: string;
    modules: Record<string, string>;
  };
}

export async function generateDocumentation(
  repoPath?: string | null,
  format: 'markdown' | 'html' = 'markdown',
  repositoryId?: number | null
): Promise<GenerateDocsResponse> {
  const payload: Record<string, unknown> = { format };
  if (repositoryId != null) {
    payload.repository_id = repositoryId;
  } else if (repoPath) {
    payload.repo_path = repoPath;
  }
  return apiPost<GenerateDocsResponse>('/documentation/generate', payload);
}
