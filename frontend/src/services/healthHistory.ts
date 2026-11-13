import { apiGet } from './api';

export interface HealthSnapshot {
  snapshot_id: string;
  repo_path: string;
  timestamp: string;
  overall_score: number;
  letter_grade: string;
  tech_debt_minutes: number;
  total_findings: number;
  critical_findings: number;
  high_findings: number;
  dimension_scores: Record<string, number>;
  metrics: Record<string, unknown>;
}

export interface ComparisonDelta {
  baseline_id: string;
  current_id: string;
  baseline_time: string;
  current_time: string;
  score_delta: number;
  letter_grade_change: string;
  tech_debt_delta_minutes: number;
  new_findings_count: number;
  resolved_findings_count: number;
  dimension_deltas: Record<string, number>;
  degrading_modules: string[];
  improving_modules: string[];
}

export async function fetchHealthHistory(
  repoPath?: string | null,
  repositoryId?: number | null
): Promise<HealthSnapshot[]> {
  const params: Record<string, string> = {};
  if (repositoryId != null) {
    params.repository_id = String(repositoryId);
  } else if (repoPath) {
    params.repo_path = repoPath;
  }
  return apiGet<HealthSnapshot[]>('/health-score/history', params);
}

export async function compareHealthSnapshots(
  repoPath?: string | null,
  baselineId?: string,
  currentId?: string,
  repositoryId?: number | null
): Promise<ComparisonDelta> {
  const params: Record<string, string> = {};
  if (repositoryId != null) {
    params.repository_id = String(repositoryId);
  } else if (repoPath) {
    params.repo_path = repoPath;
  }
  if (baselineId) params.baseline_id = baselineId;
  if (currentId) params.current_id = currentId;
  return apiGet<ComparisonDelta>('/health-score/compare', params);
}
