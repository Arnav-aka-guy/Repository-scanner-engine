import { apiPost } from './api';
import { SearchResult } from '../types/chat';

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  total: number;
}

export async function semanticSearch(
  query: string,
  topK: number = 10,
  repoPath?: string | null,
  repositoryId?: number | null
): Promise<SearchResponse> {
  const payload: { query: string; top_k: number; repo_path?: string; repository_id?: number } = {
    query,
    top_k: topK,
  };
  if (repositoryId != null) {
    payload.repository_id = repositoryId;
  } else if (repoPath) {
    payload.repo_path = repoPath;
  }
  return apiPost<SearchResponse>('/search/', payload);
}
