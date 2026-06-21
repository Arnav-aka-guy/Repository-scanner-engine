import { apiGet } from './api';
import { AnalysisResult } from '../types/graph';

export async function getDependencyGraph(repoPath: string): Promise<any> {
  return apiGet<any>('/graph/dependency', { repo_path: repoPath });
}

export async function getCallGraph(repoPath: string): Promise<any> {
  return apiGet<any>('/graph/call', { repo_path: repoPath });
}

export async function getAnalysis(repoPath: string): Promise<AnalysisResult> {
  return apiGet<AnalysisResult>('/graph/analysis', { repo_path: repoPath });
}
