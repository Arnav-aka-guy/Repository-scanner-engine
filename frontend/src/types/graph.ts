export interface GraphNode {
  id: string;
  label: string;
  node_type: 'file' | 'class' | 'function' | 'method';
  file_path: string;
  metadata: Record<string, any>;
}

export interface GraphEdge {
  source: string;
  target: string;
  edge_type: 'imports' | 'calls' | 'inherits' | 'contains';
  metadata: Record<string, any>;
}

export interface GraphData {
  nodes: { data: GraphNode }[];
  edges: { data: GraphEdge }[];
}

export interface AnalysisResult {
  dead_code: GraphNode[];
  circular_dependencies: string[][];
  complexity_metrics: Record<string, number>;
}
