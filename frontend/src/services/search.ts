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
  repoPath?: string
): Promise<SearchResponse> {
  const payload: { query: string; top_k: number; repo_path?: string } = {
    query,
    top_k: topK,
  };
  if (repoPath) {
    payload.repo_path = repoPath;
  }
  return apiPost<SearchResponse>('/search/', payload);
}
