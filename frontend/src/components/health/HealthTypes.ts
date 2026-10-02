/* ─── Health Dashboard Shared Types ───────────────────────── */

export interface Deduction {
  reason: string;
  amount: number;
}

export interface Dimension {
  name: string;
  score: number;
  max_score: number;
  deductions: Deduction[];
}

export interface HealthScore {
  total_score: number;
  grade: string;
  summary: string;
  dimensions: Dimension[];
}

export interface TopOffender {
  path: string;
  debt_score: number;
  smell_count: number;
}

export interface TechDebt {
  total_debt_score: number;
  debt_rating: string;
  total_smells: number;
  smells_by_category: Record<string, number>;
  smells_by_severity: Record<string, number>;
  suggestions: string[];
  top_offenders: TopOffender[];
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
