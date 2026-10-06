import { apiGet } from './api';
import { AnalysisResult, ImpactAnalysisResult } from '../types/graph';

export async function getDependencyGraph(repoPath: string): Promise<any> {
  return apiGet<any>('/graph/dependency', { repo_path: repoPath });
}

export async function getCallGraph(repoPath: string): Promise<any> {
  return apiGet<any>('/graph/call', { repo_path: repoPath });
}

export async function getSymbolGraph(repoPath: string): Promise<any> {
  return apiGet<any>('/graph/symbol', { repo_path: repoPath });
}

export async function getChangeImpact(repoPath: string, targetFile: string): Promise<ImpactAnalysisResult> {
  return apiGet<ImpactAnalysisResult>('/graph/impact', { repo_path: repoPath, target_file: targetFile });
}

export async function getAnalysis(repoPath: string): Promise<AnalysisResult> {
  return apiGet<AnalysisResult>('/graph/analysis', { repo_path: repoPath });
}

