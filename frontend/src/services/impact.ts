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
  repo_path: string;
  target_files: string[];
  target_symbols?: string[];
}

export async function analyzeChangeImpact(
  repoPath: string,
  targetFiles: string[],
  targetSymbols: string[] = []
): Promise<ImpactReport> {
  return apiPost<ImpactReport>('/impact/analyze', {
    repo_path: repoPath,
    target_files: targetFiles,
    target_symbols: targetSymbols,
  });
}

export async function exportChangeImpact(
  repoPath: string,
  targetFiles: string[],
  targetSymbols: string[] = [],
  format = 'markdown'
): Promise<{ format: string; report: string }> {
  return apiPost<{ format: string; report: string }>(`/impact/export?format=${format}`, {
    repo_path: repoPath,
    target_files: targetFiles,
    target_symbols: targetSymbols,
  });
}
