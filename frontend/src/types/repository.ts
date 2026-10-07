export interface FileInfo {
  path: string;
  name: string;
  extension: string;
  size_bytes: number;
  line_count: number;
  language: string;
}

export interface CodeEntity {
  name: string;
  entity_type: 'class' | 'function' | 'method';
  file_path: string;
  start_line: number;
  end_line: number;
  docstring: string;
  source_code: string;
}

export interface RepositoryInfo {
  path: string;
  name: string;
  total_files: number;
  total_lines: number;
  languages: Record<string, number>;
  scanned_at: string;
}

export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileTreeNode[];
  extension?: string;
}

export interface SavedRepository {
  id: number;
  name: string;
  description?: string | null;
  source_type: 'local' | 'github';
  source_path: string;
  status: 'CREATED' | 'SCANNING' | 'READY' | 'FAILED' | 'ARCHIVED';
  language?: string | null;
  file_count: number;
  total_files: number;
  total_lines: number;
  languages: Record<string, number>;
  last_scanned_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface RepositoryListResponse {
  repositories: SavedRepository[];
  count: number;
  max_limit: number;
  available_slots: number;
}
