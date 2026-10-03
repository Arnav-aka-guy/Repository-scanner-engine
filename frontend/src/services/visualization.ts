/**
 * Visualization API service — Mermaid diagrams and architecture layer data.
 */

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export interface MermaidResponse {
  graph_type: string;
  diagram: string;
}

export interface ArchitectureLayer {
  name: string;
  files: string[];
  dependencies: string[];
}

export interface ArchitectureResponse {
  layers: ArchitectureLayer[];
  diagram: string;
}

/**
 * Fetch a Mermaid diagram for a repository.
 * @param repoPath Absolute path to the repository root.
 * @param graphType 'dependency' | 'call'
 */
export async function getMermaidDiagram(
  repoPath: string,
  graphType: 'dependency' | 'call' = 'dependency'
): Promise<MermaidResponse> {
  const params = new URLSearchParams({ repo_path: repoPath, graph_type: graphType });
  const res = await fetch(`${API_BASE}/api/viz/mermaid?${params}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? `Mermaid diagram request failed (${res.status})`);
  }
  return res.json() as Promise<MermaidResponse>;
}

/**
 * Fetch architecture layer data and Mermaid diagram for a repository.
 * @param repoPath Absolute path to the repository root.
 */
export async function getArchitectureDiagram(
  repoPath: string
): Promise<ArchitectureResponse> {
  const params = new URLSearchParams({ repo_path: repoPath });
  const res = await fetch(`${API_BASE}/api/viz/architecture?${params}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? `Architecture diagram request failed (${res.status})`);
  }
  return res.json() as Promise<ArchitectureResponse>;
}
