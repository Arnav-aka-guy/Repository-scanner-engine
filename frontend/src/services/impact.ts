import { apiPost } from './api';

export interface ModuleImpact {
  file_path: string;
  reason: string;
  imported_symbols: string[];
}

export interface ImpactReport {
  target_files: string[];
  target_symbols: string[];
  risk_score: number;
  risk_level: 'Low' | 'Medium' | 'High' | 'Critical';
  risk_factors: string[];
  directly_affected_modules: ModuleImpact[];
  indirectly_affected_modules: ModuleImpact[];
  affected_callers: string[];
  affected_callees: string[];
  shared_classes: string[];
  api_consumers: string[];
  recommended_tests: string[];
  regression_risks: string[];
  total_affected_count: number;
}

export interface ImpactRequest {
  repo_path?: string;
  repository_id?: number | null;
  target_files: string[];
  target_symbols?: string[];
}

export async function analyzeChangeImpact(
  repoPath: string,
  targetFiles: string[],
  targetSymbols: string[] = [],
  repositoryId?: number | null
): Promise<ImpactReport> {
  const payload: Record<string, unknown> = {
    target_files: targetFiles,
    target_symbols: targetSymbols,
  };
  if (repositoryId != null) payload.repository_id = repositoryId;
  if (repoPath) payload.repo_path = repoPath;
  return apiPost<ImpactReport>('/impact/analyze', payload);
}

export async function exportChangeImpact(
  repoPath: string,
  targetFiles: string[],
  targetSymbols: string[] = [],
  format = 'markdown',
  repositoryId?: number | null
): Promise<{ format: string; report: string }> {
  const payload: Record<string, unknown> = {
    target_files: targetFiles,
    target_symbols: targetSymbols,
  };
  if (repositoryId != null) payload.repository_id = repositoryId;
  if (repoPath) payload.repo_path = repoPath;
  return apiPost<{ format: string; report: string }>(`/impact/export?format=${format}`, payload);
}
