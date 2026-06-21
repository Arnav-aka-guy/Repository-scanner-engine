export interface SearchResult {
  file_path: string;
  entity_name: string;
  entity_type: string;
  score: number;
  source_code: string;
  docstring: string;
  start_line: number;
  end_line: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  sources?: SearchResult[];
}
