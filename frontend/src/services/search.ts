import { apiPost } from './api';
import { SearchResult } from '../types/chat';

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  total: number;
}

export async function semanticSearch(query: string, topK: number = 10): Promise<SearchResponse> {
  return apiPost<SearchResponse>('/search/', { query, top_k: topK });
}
