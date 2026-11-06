import { apiPost } from './api';

export interface ReviewFinding {
  file_path: string;
  line_start: number;
  line_end: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: 'security' | 'bug' | 'performance' | 'quality' | 'missing_test';
  title: string;
  explanation: string;
  evidence: string;
  suggested_fix: string;
  confidence: number;
  source: string;
}

export interface CodeReviewResponse {
  files_reviewed: string[];
  total_findings: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  findings: ReviewFinding[];
  summary: string;
  deterministic_mode: boolean;
}

export async function runCodeReview(
  repoPath: string,
  diffText?: string,
  useLlm = false
): Promise<CodeReviewResponse> {
  return apiPost<CodeReviewResponse>('/review/analyze', {
    repo_path: repoPath,
    diff_text: diffText || undefined,
    use_llm: useLlm,
  });
}
