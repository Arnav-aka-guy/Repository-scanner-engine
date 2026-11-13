import { apiGet, apiPost } from './api';

export type DesignGroupId = 'client' | 'backend' | 'data' | 'external';
export type DesignDetail = 'overview' | 'detailed';

export interface DesignGroup {
  id: DesignGroupId;
  label: string;
  description: string;
}

export interface DesignNode {
  id: string;
  label: string;
  kind: string;
  group: DesignGroupId;
  description: string;
  tech: string[];
  paths: string[];
}

export interface DesignEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  kind: string;
}

export interface DesignFlow {
  name: string;
  steps: string[];
}

export interface SystemDesignDiagram {
  title: string;
  summary: string;
  groups: DesignGroup[];
  nodes: DesignNode[];
  edges: DesignEdge[];
  flows: DesignFlow[];
  mermaid: string;
  generated_by: string;
  detail: DesignDetail;
  warnings: string[];
  stats: Record<string, unknown>;
  generated_at: string;
  cache_hit: boolean;
}

export interface RepoRef {
  repositoryId?: number | null;
  repoPath?: string | null;
}

function repoParams(ref: RepoRef): Record<string, string> {
  if (ref.repositoryId != null) return { repository_id: String(ref.repositoryId) };
  if (ref.repoPath) return { repo_path: ref.repoPath };
  throw new Error('No repository selected.');
}

export async function generateSystemDesign(
  ref: RepoRef,
  options: { detail?: DesignDetail; useAi?: boolean; refresh?: boolean; signal?: AbortSignal } = {}
): Promise<SystemDesignDiagram> {
  const body: Record<string, unknown> = {
    detail: options.detail ?? 'overview',
    use_ai: options.useAi ?? true,
    refresh: options.refresh ?? false,
  };
  if (ref.repositoryId != null) body.repository_id = ref.repositoryId;
  else if (ref.repoPath) body.repo_path = ref.repoPath;
  else throw new Error('No repository selected.');
  return apiPost<SystemDesignDiagram>('/system-design/generate', body, { signal: options.signal });
}

/** Returns the cached diagram, or null when none has been generated yet. */
export async function getCachedSystemDesign(
  ref: RepoRef,
  detail: DesignDetail = 'overview',
  signal?: AbortSignal
): Promise<SystemDesignDiagram | null> {
  try {
    const result = await apiGet<SystemDesignDiagram | null>('/system-design', { ...repoParams(ref), detail }, { signal });
    return result && Array.isArray(result.nodes) ? result : null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/no system design has been generated/i.test(msg)) return null;
    throw err;
  }
}
