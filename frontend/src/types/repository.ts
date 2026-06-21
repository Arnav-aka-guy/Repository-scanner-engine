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

export interface RepositoryContextType {
  repoPath: string;
  loading: boolean;
  error: string | null;
  repoInfo: RepositoryInfo | null;
  files: FileInfo[];
  fileTree: FileTreeNode[];
  selectedFilePath: string | null;
  setSelectedFilePath: (path: string | null) => void;
  selectedFileDetail: {
    content: string;
    language: string;
    entities: any[];
  } | null;
  fileLoading: boolean;
  handleScan: (path: string) => Promise<void>;
  selectLocalDirectory: () => Promise<void>;
}

