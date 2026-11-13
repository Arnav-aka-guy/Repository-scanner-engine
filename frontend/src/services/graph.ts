import { apiGet } from './api';
import { AnalysisResult, GraphData, ImpactAnalysisResult } from '../types/graph';

function buildRepoParams(
  repoPath?: string | null,
  repositoryId?: number | null,
  extra?: Record<string, string>
): Record<string, string> {
  const params: Record<string, string> = { ...extra };
  if (repositoryId != null) {
    params.repository_id = String(repositoryId);
  } else if (repoPath) {
    params.repo_path = repoPath;
  }
  return params;
}

export async function getDependencyGraph(
  repoPath?: string | null,
  repositoryId?: number | null
): Promise<GraphData> {
  return apiGet<GraphData>('/graph/dependency', buildRepoParams(repoPath, repositoryId));
}

export async function getCallGraph(
  repoPath?: string | null,
  repositoryId?: number | null
): Promise<GraphData> {
  return apiGet<GraphData>('/graph/call', buildRepoParams(repoPath, repositoryId));
}

export async function getSymbolGraph(
  repoPath?: string | null,
  repositoryId?: number | null
): Promise<GraphData> {
  return apiGet<GraphData>('/graph/symbol', buildRepoParams(repoPath, repositoryId));
}

export async function getChangeImpact(
  repoPath?: string | null,
  targetFile?: string,
  repositoryId?: number | null
): Promise<ImpactAnalysisResult> {
  return apiGet<ImpactAnalysisResult>(
    '/graph/impact',
    buildRepoParams(repoPath, repositoryId, targetFile ? { target_file: targetFile } : undefined)
  );
}

export async function getAnalysis(
  repoPath?: string | null,
  repositoryId?: number | null
): Promise<AnalysisResult> {
  return apiGet<AnalysisResult>('/graph/analysis', buildRepoParams(repoPath, repositoryId));
}
