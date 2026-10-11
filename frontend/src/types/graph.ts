export interface GraphNode {
  id: string;
  label: string;
  node_type: 'file' | 'class' | 'function' | 'method' | 'import' | 'reference' | string;
  file_path: string;
  metadata?: Record<string, unknown>;
}

export interface GraphEdge {
  source: string;
  target: string;
  edge_type: 'defines' | 'imports' | 'calls' | 'references' | 'inherits' | 'implements' | 'uses' | 'contains' | string;
  metadata?: Record<string, unknown>;
}

export interface GraphElement {
  data: {
    id?: string;
    label?: string;
    source?: string;
    target?: string;
    node_type?: string;
    edge_type?: string;
    type?: string;
    file_path?: string;
    [key: string]: unknown;
  };
  group?: 'nodes' | 'edges' | string;
}

export interface GraphData {
  nodes?: Array<GraphNode | { data: GraphNode } | { id: string; label: string; [key: string]: unknown }>;
  edges?: Array<GraphEdge | { data: GraphEdge } | { source: string; target: string; [key: string]: unknown }>;
  elements?: GraphElement[];
}

export interface DeadCodeConfidenceItem {
  node: GraphNode;
  confidence: number;
  reason: string;
  references_count: number;
  status: string;
}

export interface ImpactAnalysisResult {
  target_file: string;
  risk_level: 'High' | 'Medium' | 'Low' | string;
  direct_dependents_count: number;
  indirect_dependents_count: number;
  direct_dependents: string[];
  indirect_dependents: string[];
  most_affected: string[];
  explanation: string;
}

export interface AnalysisResult {
  dead_code: GraphNode[];
  dead_code_confidence?: DeadCodeConfidenceItem[];
  circular_dependencies: string[][];
  complexity_metrics: Record<string, number>;
}

