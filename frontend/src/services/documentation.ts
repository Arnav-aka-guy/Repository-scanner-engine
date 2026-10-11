import { apiPost, apiGet } from './api';

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

export async function generateDocumentation(repoPath: string, format: 'markdown' | 'html' = 'markdown'): Promise<GenerateDocsResponse> {
  return apiPost<GenerateDocsResponse>('/documentation/generate', { repo_path: repoPath, format });
}

export async function exportDocumentation(repoPath: string, format: 'markdown' | 'html' = 'markdown'): Promise<GenerateDocsResponse> {
  return apiGet<GenerateDocsResponse>('/documentation/export', { repo_path: repoPath, format });
}
