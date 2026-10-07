/* ─── Health Dashboard Shared Types ───────────────────────── */

export interface Deduction {
  reason: string;
  amount: number;
}

export interface MeasuredMetric {
  name: string;
  key: string;
  measured_value: any;
  display_value: string;
  unit: string;
  threshold: any;
  threshold_display: string;
  status: 'good' | 'review' | 'at_risk';
  description: string;
}

export interface ScorePenalty {
  rule_id: string;
  rule_name: string;
  points_deducted: number;
  reason: string;
  threshold: string;
  observed: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  confidence: 'high' | 'medium' | 'low';
  affected_files: string[];
}

export interface FileScoreContribution {
  file_path: string;
  deduction_points: number;
  finding_count: number;
  summary: string;
}

export interface IssueCountsSummary {
  raw_signals: number;
  scoring_rules_triggered: number;
  prioritized_actionable: number;
  files_affected: number;
  explanation: string;
}

export interface AnalysisStatistics {
  files_analyzed: number;
  total_lines: number;
  total_functions: number;
  total_classes: number;
  public_functions: number;
  documented_functions: number;
  undocumented_functions: number;
  average_function_length: number;
  max_function_length: number;
  longest_function: string;
  circular_dependencies: number;
  architecture_violations: number;
  potential_secrets: number;
  total_code_smells: number;
  god_classes_count: number;
  oversized_files_count: number;
}

export interface Dimension {
  name: string;
  score: number;
  max_score: number;
  key?: string;
  weight?: number;
  status?: string; // 'Healthy' | 'Needs Review' | 'At Risk'
  formula?: string;
  total_penalties?: number;
  metrics?: MeasuredMetric[];
  penalties?: ScorePenalty[];
  top_contributors?: FileScoreContribution[];
  deductions: (Deduction | string)[];
}

export interface HealthScore {
  total_score: number;
  grade: string;
  summary: string;
  file_count?: number;
  total_lines?: number;
  weights?: Record<string, number>;
  scoring_formula?: string;
  issue_counts?: IssueCountsSummary;
  statistics?: AnalysisStatistics;
  dimensions: Dimension[];
}

export interface TopOffender {
  path: string;
  debt_score: number;
  smell_count: number;
}

export interface SmellItem {
  category: string;
  severity: string;
  file_path: string;
  entity_name?: string | null;
  line?: number | null;
  message: string;
  suggestion: string;
  threshold?: string;
  observed?: string;
  confidence?: string;
  why_it_matters?: string;
}

export interface SymbolGroup {
  file_path: string;
  entity_name?: string | null;
  line?: number | null;
  smell_count: number;
  highest_severity: string;
  smells: SmellItem[];
}

export interface TechDebt {
  total_debt_score: number;
  debt_rating: string;
  total_smells: number;
  smells_by_category: Record<string, number>;
  smells_by_severity: Record<string, number>;
  suggestions: string[];
  top_offenders: TopOffender[];
  all_smells?: SmellItem[];
  grouped_by_symbol?: SymbolGroup[];
}

export interface DependencyRisk {
  total_dependencies: number;
  python_deps: number;
  node_deps: number;
  pinning_score: number;
  risk_summary: Record<string, number>;
  suggestions: string[];
  dependencies: any[];
}
