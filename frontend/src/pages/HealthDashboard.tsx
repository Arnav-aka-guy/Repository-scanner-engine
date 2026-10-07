import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { apiGet } from '../services/api';
import {
  HealthScore,
  TechDebt,
  DependencyRisk,
  Dimension,
  MeasuredMetric,
  ScorePenalty,
  SymbolGroup,
} from '../components/health/HealthTypes';
import {
  Activity,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Bug,
  Shield,
  Layers,
  FileCode,
  BookOpen,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ExternalLink,
  MessageSquare,
  Sparkles,
  SlidersHorizontal,
  Info,
  HelpCircle,
  X,
  FileText,
  BarChart3,
  Cpu,
} from 'lucide-react';
import { colors, radius, font } from '../design-system/tokens';
import { Badge, Button, FilePath } from '../design-system/primitives';

/** Formats relative path from repository root */
function getRelativePath(fullPath: string, rootPath: string): string {
  if (!fullPath) return '';
  const normRoot = rootPath.replace(/\\/g, '/').replace(/\/+$/, '');
  const normFile = fullPath.replace(/\\/g, '/');
  if (normRoot && normFile.startsWith(normRoot)) {
    return normFile.slice(normRoot.length).replace(/^\/+/, '');
  }
  return normFile;
}

export const HealthDashboard: React.FC = () => {
  const navigate = useNavigate();
  const repoPath = useWorkspaceStore((s) => s.activeRepository);
  const setSelectedFile = useWorkspaceStore((s) => s.setSelectedFile);

  const [healthScore, setHealthScore] = useState<HealthScore | null>(null);
  const [techDebt, setTechDebt] = useState<TechDebt | null>(null);
  const [depRisk, setDepRisk] = useState<DependencyRisk | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter & View State
  const [severityFilter, setSeverityFilter] = useState<'all' | 'critical' | 'high' | 'medium' | 'low'>('all');
  const [viewMode, setViewMode] = useState<'grouped' | 'list'>('list');
  const [expandedDimension, setExpandedDimension] = useState<string | null>(null);
  const [showMethodology, setShowMethodology] = useState<boolean>(false);
  const [showTelemetry, setShowTelemetry] = useState<boolean>(false);

  useEffect(() => {
    if (!repoPath) {
      setHealthScore(null);
      setTechDebt(null);
      setDepRisk(null);
      return;
    }

    let cancelled = false;
    const fetchAll = async () => {
      setLoading(true);
      setError(null);
      try {
        const [hs, td, dr] = await Promise.all([
          apiGet<HealthScore>('/health-score', { repo_path: repoPath }),
          apiGet<TechDebt>('/tech-debt', { repo_path: repoPath }),
          apiGet<DependencyRisk>('/dependency-risk', { repo_path: repoPath }),
        ]);
        if (!cancelled) {
          setHealthScore(hs);
          setTechDebt(td);
          setDepRisk(dr);
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Failed to load code health metrics.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchAll();
    return () => {
      cancelled = true;
    };
  }, [repoPath]);

  const handleOpenFile = (path: string) => {
    setSelectedFile(path);
    navigate('/explorer');
  };

  const handleAskAI = (issueMessage: string, file: string) => {
    navigate('/chat');
    setTimeout(() => {
      const rel = getRelativePath(file, repoPath || '');
      useWorkspaceStore.getState().sendChatMessage(`How can I resolve this code health issue in ${rel}: "${issueMessage}"?`);
    }, 100);
  };

  // Human-readable status label & description
  const healthStatus = useMemo(() => {
    if (!healthScore) return { label: 'Unknown', color: colors.text.muted, description: '' };
    const score = healthScore.total_score;
    if (score >= 80) {
      return {
        label: 'Healthy',
        color: colors.status.success,
        description: 'Codebase adheres to clean architectural guidelines with minimal complexity and well-documented interfaces.',
      };
    }
    if (score >= 60) {
      return {
        label: 'Needs Review',
        color: colors.status.warning,
        description: 'Some complexity hotspots or unmaintained modules were detected that require structural review.',
      };
    }
    return {
      label: 'Needs Attention',
      color: colors.status.danger,
      description: 'Multiple architectural risks, excessive function complexity, or critical documentation gaps identified.',
    };
  }, [healthScore]);

  // Dimension explanation mappings
  const dimensionDescriptions: Record<string, string> = {
    Documentation: 'Measures docstring coverage across public functions, classes, and top-level modules.',
    Complexity: 'Evaluates function lengths (>50 lines), oversized files (>500 lines), and indentation nesting depth (>5 levels).',
    Architecture: 'Checks for circular dependency loops, high import coupling (>15 imports), and unreferenced dead code.',
    Maintainability: 'Assesses function density per file, God classes (>15 methods), and cognitive load.',
    Security: 'Detects hardcoded secrets, exposed credentials, API keys, and insecure assignments.',
  };

  // Dimension icons
  const getDimensionIcon = (name: string) => {
    switch (name.toLowerCase()) {
      case 'documentation':
        return <BookOpen size={15} style={{ color: colors.accent.blue }} />;
      case 'complexity':
        return <SlidersHorizontal size={15} style={{ color: colors.status.warning }} />;
      case 'architecture':
        return <Layers size={15} style={{ color: colors.accent.purple }} />;
      case 'maintainability':
        return <FileCode size={15} style={{ color: colors.status.info }} />;
      case 'security':
        return <Shield size={15} style={{ color: colors.status.danger }} />;
      default:
        return <Activity size={15} style={{ color: colors.text.muted }} />;
    }
  };

  // Issues extraction
  const issuesList = useMemo(() => {
    const list: Array<{
      severity: 'Critical' | 'High' | 'Medium' | 'Low';
      confidence: 'High-confidence issue' | 'Potential issue' | 'Heuristic finding';
      file: string;
      symbol?: string;
      category: string;
      problem: string;
      evidence: string;
      threshold?: string;
      observed?: string;
      whyItMatters: string;
      suggestedAction: string;
    }> = [];

    if (techDebt?.all_smells && techDebt.all_smells.length > 0) {
      for (const smell of techDebt.all_smells) {
        const sev = (smell.severity || 'medium').toLowerCase();
        const sevLabel: 'Critical' | 'High' | 'Medium' | 'Low' =
          sev === 'critical' ? 'Critical' : sev === 'high' ? 'High' : sev === 'low' ? 'Low' : 'Medium';

        const confLabel: 'High-confidence issue' | 'Potential issue' | 'Heuristic finding' =
          smell.confidence === 'high'
            ? 'High-confidence issue'
            : smell.confidence === 'low'
            ? 'Heuristic finding'
            : 'Potential issue';

        let whyItMatters = smell.why_it_matters || 'May complicate onboarding, refactoring, or maintenance of this module.';
        if (!smell.why_it_matters) {
          if (smell.category === 'complexity' || smell.category === 'long_function') {
            whyItMatters = 'Functions with excessive length and branching logic are prone to runtime defects and are difficult to test.';
          } else if (smell.category === 'missing_docstring') {
            whyItMatters = 'Public interfaces without documentation require consumers to inspect implementation internals.';
          } else if (smell.category === 'god_class') {
            whyItMatters = 'Classes handling too many responsibilities violate SRP and cause high coupling.';
          }
        }

        list.push({
          severity: sevLabel,
          confidence: confLabel,
          file: smell.file_path,
          symbol: smell.entity_name || undefined,
          category: smell.category || 'General',
          problem: smell.message,
          evidence: smell.line ? `Line ${smell.line}` : 'Module level',
          threshold: smell.threshold,
          observed: smell.observed,
          whyItMatters,
          suggestedAction: smell.suggestion || 'Review function structure and apply modular extraction.',
        });
      }
    } else if (techDebt?.top_offenders) {
      for (const off of techDebt.top_offenders) {
        list.push({
          severity: 'High',
          confidence: 'High-confidence issue',
          file: off.path,
          category: 'Maintainability',
          problem: `Accumulated ${off.smell_count} code smells and technical debt score of ${off.debt_score}.`,
          evidence: `${off.smell_count} smells detected`,
          whyItMatters: 'Concentrated debt hotspots slow down feature delivery and increase defect frequency.',
          suggestedAction: 'Break down large functions into focused helpers and document public interfaces.',
        });
      }
    }

    return list;
  }, [techDebt]);

  // Filtered issues
  const filteredIssues = useMemo(() => {
    if (severityFilter === 'all') return issuesList;
    return issuesList.filter((i) => i.severity.toLowerCase() === severityFilter);
  }, [issuesList, severityFilter]);

  // Filtered grouped symbols
  const filteredGroups = useMemo(() => {
    if (!techDebt?.grouped_by_symbol) return [];
    if (severityFilter === 'all') return techDebt.grouped_by_symbol;
    return techDebt.grouped_by_symbol.filter((g) =>
      g.smells.some((s) => s.severity.toLowerCase() === severityFilter)
    );
  }, [techDebt, severityFilter]);

  if (!repoPath) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', color: colors.text.muted }}>
        <Activity size={32} style={{ color: colors.accent.blue, marginBottom: '12px' }} />
        <span style={{ fontSize: '13px', color: colors.text.primary, fontWeight: 600 }}>No Repository Selected</span>
        <span style={{ fontSize: '12px', color: colors.text.muted, marginTop: '4px' }}>
          Open a codebase in the Overview dashboard to inspect code health and technical debt.
        </span>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
        <Activity size={28} className="animate-spin" style={{ color: colors.accent.blue }} />
        <span style={{ fontSize: '13px', color: colors.text.secondary }}>Computing transparent health score & analyzing AST metrics...</span>
      </div>
    );
  }

  if (error || !healthScore) {
    return (
      <div style={{ padding: '32px', textAlign: 'center', color: colors.status.danger, fontSize: '13px' }}>
        {error || 'Unable to compute code health.'}
      </div>
    );
  }

  const issueCounts = healthScore.issue_counts || {
    raw_signals: techDebt?.total_smells || issuesList.length,
    scoring_rules_triggered: healthScore.dimensions.reduce((acc, d) => acc + (d.penalties?.length || d.deductions.length || 0), 0),
    prioritized_actionable: issuesList.filter((i) => i.severity === 'Critical' || i.severity === 'High').length,
    files_affected: healthScore.file_count || 0,
    explanation: 'Scoring rules evaluate aggregate thresholds to apply point deductions, while prioritized findings highlight critical actionable items.',
  };

  const stats = healthScore.statistics;

  return (
    <div
      className="flex-1 flex flex-col overflow-hidden w-full h-full select-none"
      style={{ backgroundColor: colors.bg.primary }}
    >
      {/* ── 1. Page Header ── */}
      <div
        style={{
          padding: '12px 24px',
          borderBottom: `1px solid ${colors.border.default}`,
          backgroundColor: colors.bg.surface,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity size={17} style={{ color: colors.accent.blue }} />
            <h1 style={{ fontSize: font.size.base, fontWeight: 600, color: colors.text.primary, margin: 0 }}>
              Code Health &amp; Technical Debt
            </h1>
            <Badge variant="default">Transparent Scoring</Badge>
          </div>
          <span style={{ fontSize: '12px', color: colors.text.secondary }}>
            Explainable evaluation across 5 weighted dimensions with exact deduction tracing and AST metrics.
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowMethodology(true)}
            icon={<HelpCircle size={13} style={{ color: colors.accent.blue }} />}
          >
            How scoring works
          </Button>
        </div>
      </div>

      {/* ── 2. Scrollable Body ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
        <div style={{ maxWidth: '980px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* ── Section A: Overall Health Summary & Score Transparency ── */}
          <div
            style={{
              backgroundColor: colors.bg.surface,
              border: `1px solid ${colors.border.default}`,
              borderRadius: radius.lg,
              padding: '20px 24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '24px', alignItems: 'center' }}>
              {/* Score Dial */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  paddingRight: '24px',
                  borderRight: `1px solid ${colors.border.subtle}`,
                  minWidth: '150px',
                }}
              >
                <span style={{ fontSize: '11px', color: colors.text.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>
                  Overall Health
                </span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                  <span style={{ fontSize: '38px', fontWeight: 700, fontFamily: font.mono, color: healthStatus.color, lineHeight: 1 }}>
                    {Math.round(healthScore.total_score)}
                  </span>
                  <span style={{ fontSize: '13px', color: colors.text.muted, fontFamily: font.mono }}>
                    / 100
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
                  <Badge variant={healthScore.grade === 'A' ? 'green' : healthScore.grade === 'B' ? 'blue' : healthScore.grade === 'C' ? 'yellow' : 'red'}>
                    Grade {healthScore.grade}
                  </Badge>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: healthStatus.color }}>
                    {healthStatus.label}
                  </span>
                </div>
              </div>

              {/* Composition & Summary */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Sparkles size={14} style={{ color: colors.accent.blue }} />
                  <span style={{ fontSize: '12px', fontWeight: 600, color: colors.text.primary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Score Composition &amp; Traceability
                  </span>
                </div>
                <p style={{ fontSize: '12px', color: colors.text.secondary, margin: 0, lineHeight: 1.5 }}>
                  {healthStatus.description} {healthScore.summary}
                </p>
                {healthScore.scoring_formula && (
                  <div
                    style={{
                      fontFamily: font.mono,
                      fontSize: '11px',
                      color: colors.text.muted,
                      backgroundColor: colors.bg.surfaceSecondary,
                      padding: '6px 10px',
                      borderRadius: radius.md,
                      border: `1px solid ${colors.border.subtle}`,
                    }}
                  >
                    Formula: {healthScore.scoring_formula}
                  </div>
                )}
              </div>
            </div>

            {/* ── Issue Counts Reconciliation (PRD Section 11) ── */}
            <div
              style={{
                borderTop: `1px solid ${colors.border.subtle}`,
                paddingTop: '14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                <div
                  style={{
                    backgroundColor: colors.bg.surfaceSecondary,
                    border: `1px solid ${colors.border.subtle}`,
                    borderRadius: radius.md,
                    padding: '8px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                  }}
                >
                  <span style={{ fontSize: '11px', color: colors.text.muted }}>Raw Code Signals</span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                    <span style={{ fontSize: '18px', fontWeight: 700, fontFamily: font.mono, color: colors.text.primary }}>
                      {issueCounts.raw_signals}
                    </span>
                    <span style={{ fontSize: '10px', color: colors.text.muted }}>smells detected</span>
                  </div>
                </div>

                <div
                  style={{
                    backgroundColor: colors.bg.surfaceSecondary,
                    border: `1px solid ${colors.border.subtle}`,
                    borderRadius: radius.md,
                    padding: '8px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                  }}
                >
                  <span style={{ fontSize: '11px', color: colors.text.muted }}>Scoring Rules Triggered</span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                    <span style={{ fontSize: '18px', fontWeight: 700, fontFamily: font.mono, color: colors.accent.blue }}>
                      {issueCounts.scoring_rules_triggered}
                    </span>
                    <span style={{ fontSize: '10px', color: colors.text.muted }}>dimension deductions</span>
                  </div>
                </div>

                <div
                  style={{
                    backgroundColor: colors.bg.surfaceSecondary,
                    border: `1px solid ${colors.border.subtle}`,
                    borderRadius: radius.md,
                    padding: '8px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                  }}
                >
                  <span style={{ fontSize: '11px', color: colors.text.muted }}>Prioritized Actionable</span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                    <span style={{ fontSize: '18px', fontWeight: 700, fontFamily: font.mono, color: colors.status.warning }}>
                      {issueCounts.prioritized_actionable}
                    </span>
                    <span style={{ fontSize: '10px', color: colors.text.muted }}>critical / high priority</span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Info size={12} style={{ color: colors.text.muted, flexShrink: 0 }} />
                <span style={{ fontSize: '11px', color: colors.text.muted, lineHeight: 1.4 }}>
                  {issueCounts.explanation}
                </span>
              </div>
            </div>
          </div>

          {/* ── Section B: Dimensions (5 Pillars with Drilldown) ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: colors.text.muted }}>
                Scoring Dimensions (5 Pillars — 20 pts each)
              </span>
              <span style={{ fontSize: '11px', color: colors.text.muted }}>
                Click any card to inspect what was measured, rules evaluated, and contributing files
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {healthScore.dimensions.map((dim: Dimension) => {
                const isExpanded = expandedDimension === dim.name;
                const pct = Math.round((dim.score / dim.max_score) * 100);
                const statusColor = pct >= 80 ? colors.status.success : pct >= 60 ? colors.status.warning : colors.status.danger;
                const statusLabel = dim.status || (pct >= 80 ? 'Healthy' : pct >= 60 ? 'Needs Review' : 'At Risk');
                const penaltyCount = dim.penalties?.length ?? 0;
                const deductionPoints = dim.total_penalties ?? (dim.max_score - dim.score);

                return (
                  <div
                    key={dim.name}
                    style={{
                      backgroundColor: colors.bg.surface,
                      border: `1px solid ${isExpanded ? colors.accent.blue : colors.border.default}`,
                      borderRadius: radius.md,
                      overflow: 'hidden',
                      transition: 'border-color 0.15s ease',
                    }}
                  >
                    {/* Clickable Header Row */}
                    <div
                      onClick={() => setExpandedDimension(isExpanded ? null : dim.name)}
                      style={{
                        padding: '14px 18px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        userSelect: 'none',
                        backgroundColor: isExpanded ? colors.bg.surfaceSecondary : 'transparent',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: radius.md,
                            backgroundColor: colors.bg.elevated,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {getDimensionIcon(dim.name)}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 600, color: colors.text.primary }}>
                              {dim.name}
                            </span>
                            <Badge variant={statusLabel === 'Healthy' ? 'green' : statusLabel === 'Needs Review' ? 'yellow' : 'red'}>
                              {statusLabel}
                            </Badge>
                            <span style={{ fontSize: '11px', color: colors.text.muted, fontFamily: font.mono }}>
                              (Weight: 20%)
                            </span>
                          </div>
                          <span style={{ fontSize: '11px', color: colors.text.secondary }}>
                            {dimensionDescriptions[dim.name] || 'Evaluates codebase health standard.'}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '1px' }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: '3px' }}>
                            <span style={{ fontSize: '20px', fontWeight: 700, fontFamily: font.mono, color: statusColor }}>
                              {dim.score}
                            </span>
                            <span style={{ fontSize: '12px', color: colors.text.muted, fontFamily: font.mono }}>
                              / {dim.max_score}
                            </span>
                          </div>
                          {deductionPoints > 0 ? (
                            <span style={{ fontSize: '10px', color: colors.status.danger, fontFamily: font.mono }}>
                              -{deductionPoints.toFixed(1)} pts ({penaltyCount} deduction{penaltyCount === 1 ? '' : 's'})
                            </span>
                          ) : (
                            <span style={{ fontSize: '10px', color: colors.status.success, fontFamily: font.mono }}>
                              No deductions
                            </span>
                          )}
                        </div>

                        <div style={{ color: colors.text.muted }}>
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </div>
                      </div>
                    </div>

                    {/* Expanded Detail Panel */}
                    {isExpanded && (
                      <div
                        style={{
                          padding: '16px 18px',
                          borderTop: `1px solid ${colors.border.subtle}`,
                          backgroundColor: colors.bg.primary,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '16px',
                        }}
                      >
                        {/* Formula Explanation */}
                        {dim.formula && (
                          <div
                            style={{
                              padding: '8px 12px',
                              borderRadius: radius.md,
                              backgroundColor: colors.bg.surface,
                              border: `1px solid ${colors.border.subtle}`,
                              fontFamily: font.mono,
                              fontSize: '11px',
                              color: colors.accent.blue,
                            }}
                          >
                            <strong>Deduction Math:</strong> {dim.formula}
                          </div>
                        )}

                        {/* What was measured */}
                        {dim.metrics && dim.metrics.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 600, color: colors.text.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                              What was measured &amp; Observed Metrics
                            </span>
                            <div
                              style={{
                                borderRadius: radius.md,
                                border: `1px solid ${colors.border.default}`,
                                overflow: 'hidden',
                              }}
                            >
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                                <thead>
                                  <tr style={{ backgroundColor: colors.bg.surface, borderBottom: `1px solid ${colors.border.default}` }}>
                                    <th style={{ padding: '8px 12px', color: colors.text.muted, fontWeight: 500 }}>Parameter</th>
                                    <th style={{ padding: '8px 12px', color: colors.text.muted, fontWeight: 500 }}>Measured Value</th>
                                    <th style={{ padding: '8px 12px', color: colors.text.muted, fontWeight: 500 }}>Threshold</th>
                                    <th style={{ padding: '8px 12px', color: colors.text.muted, fontWeight: 500 }}>Status</th>
                                    <th style={{ padding: '8px 12px', color: colors.text.muted, fontWeight: 500 }}>Description</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {dim.metrics.map((m: MeasuredMetric, mIdx: number) => (
                                    <tr
                                      key={mIdx}
                                      style={{
                                        borderBottom: mIdx < dim.metrics!.length - 1 ? `1px solid ${colors.border.subtle}` : 'none',
                                        backgroundColor: colors.bg.surfaceSecondary,
                                      }}
                                    >
                                      <td style={{ padding: '8px 12px', fontWeight: 600, color: colors.text.primary }}>
                                        {m.name}
                                      </td>
                                      <td style={{ padding: '8px 12px', fontFamily: font.mono, color: m.status === 'at_risk' ? colors.status.danger : colors.text.primary }}>
                                        {m.display_value}
                                      </td>
                                      <td style={{ padding: '8px 12px', fontFamily: font.mono, color: colors.text.muted }}>
                                        {m.threshold_display}
                                      </td>
                                      <td style={{ padding: '8px 12px' }}>
                                        <Badge variant={m.status === 'good' ? 'green' : m.status === 'review' ? 'yellow' : 'red'}>
                                          {m.status === 'good' ? 'Healthy' : m.status === 'review' ? 'Review' : 'Exceeds threshold'}
                                        </Badge>
                                      </td>
                                      <td style={{ padding: '8px 12px', color: colors.text.secondary, fontSize: '11px' }}>
                                        {m.description}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* Exact Penalties Applied */}
                        {dim.penalties && dim.penalties.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 600, color: colors.text.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                              Deduction Rules Triggered ({dim.penalties.length})
                            </span>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {dim.penalties.map((pen: ScorePenalty, pIdx: number) => (
                                <div
                                  key={pIdx}
                                  style={{
                                    backgroundColor: colors.bg.surface,
                                    border: `1px solid ${colors.border.default}`,
                                    borderRadius: radius.md,
                                    padding: '10px 12px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '6px',
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <Badge variant="red">-{pen.points_deducted.toFixed(1)} pts</Badge>
                                      <span style={{ fontSize: '12px', fontWeight: 600, color: colors.text.primary }}>
                                        {pen.rule_name}
                                      </span>
                                      <Badge variant="default">Confidence: {pen.confidence}</Badge>
                                    </div>
                                    <span style={{ fontSize: '11px', color: colors.text.muted, fontFamily: font.mono }}>
                                      Observed: {pen.observed} (Threshold: {pen.threshold})
                                    </span>
                                  </div>
                                  <span style={{ fontSize: '11px', color: colors.text.secondary }}>
                                    {pen.reason}
                                  </span>
                                  {pen.affected_files && pen.affected_files.length > 0 && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '2px' }}>
                                      <span style={{ fontSize: '10px', color: colors.text.muted }}>Affected files:</span>
                                      {pen.affected_files.map((af, afIdx) => (
                                        <button
                                          key={afIdx}
                                          onClick={() => handleOpenFile(af)}
                                          style={{
                                            fontSize: '10px',
                                            fontFamily: font.mono,
                                            color: colors.accent.blue,
                                            backgroundColor: colors.bg.elevated,
                                            border: `1px solid ${colors.border.subtle}`,
                                            borderRadius: radius.sm,
                                            padding: '1px 5px',
                                            cursor: 'pointer',
                                          }}
                                        >
                                          {getRelativePath(af, repoPath)}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: colors.status.success, fontSize: '12px' }}>
                            <CheckCircle2 size={14} />
                            <span>No deduction rules were triggered for this dimension. Full 20.0 points awarded.</span>
                          </div>
                        )}

                        {/* Top Contributors */}
                        {dim.top_contributors && dim.top_contributors.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 600, color: colors.text.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                              Top Contributing Files
                            </span>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              {dim.top_contributors.map((contrib, cIdx) => (
                                <div
                                  key={cIdx}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '6px 10px',
                                    borderRadius: radius.sm,
                                    backgroundColor: colors.bg.surfaceSecondary,
                                    border: `1px solid ${colors.border.subtle}`,
                                    fontSize: '11px',
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontFamily: font.mono, color: colors.text.primary }}>
                                      {getRelativePath(contrib.file_path, repoPath)}
                                    </span>
                                    <span style={{ color: colors.text.muted }}>—</span>
                                    <span style={{ color: colors.text.secondary }}>{contrib.summary}</span>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ color: colors.status.danger, fontFamily: font.mono }}>
                                      -{contrib.deduction_points} pts
                                    </span>
                                    <button
                                      onClick={() => handleOpenFile(contrib.file_path)}
                                      style={{
                                        color: colors.accent.blue,
                                        background: 'none',
                                        border: 'none',
                                        cursor: 'pointer',
                                        padding: 0,
                                        fontSize: '11px',
                                      }}
                                    >
                                      Open
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Section C: Prioritized Issues & Symbol Grouping ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: colors.text.muted }}>
                  Prioritized Code Quality Issues ({filteredIssues.length})
                </span>

                {/* View Mode Toggle (Grouped by Symbol vs All Findings) */}
                <div
                  style={{
                    display: 'flex',
                    backgroundColor: colors.bg.surfaceSecondary,
                    borderRadius: radius.md,
                    padding: '2px',
                    border: `1px solid ${colors.border.subtle}`,
                  }}
                >
                  <button
                    onClick={() => setViewMode('grouped')}
                    style={{
                      fontSize: '11px',
                      fontWeight: viewMode === 'grouped' ? 600 : 400,
                      padding: '3px 8px',
                      borderRadius: radius.sm,
                      border: 'none',
                      backgroundColor: viewMode === 'grouped' ? colors.bg.elevated : 'transparent',
                      color: viewMode === 'grouped' ? colors.text.primary : colors.text.muted,
                      cursor: 'pointer',
                    }}
                  >
                    Grouped by Symbol ({filteredGroups.length})
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    style={{
                      fontSize: '11px',
                      fontWeight: viewMode === 'list' ? 600 : 400,
                      padding: '3px 8px',
                      borderRadius: radius.sm,
                      border: 'none',
                      backgroundColor: viewMode === 'list' ? colors.bg.elevated : 'transparent',
                      color: viewMode === 'list' ? colors.text.primary : colors.text.muted,
                      cursor: 'pointer',
                    }}
                  >
                    All Findings ({filteredIssues.length})
                  </button>
                </div>
              </div>

              {/* Severity filter tabs */}
              <div style={{ display: 'flex', gap: '4px' }}>
                {(['all', 'critical', 'high', 'medium', 'low'] as const).map((sev) => {
                  const isActive = severityFilter === sev;
                  return (
                    <button
                      key={sev}
                      onClick={() => setSeverityFilter(sev)}
                      style={{
                        fontSize: '11px',
                        fontWeight: isActive ? 600 : 400,
                        textTransform: 'capitalize',
                        padding: '3px 8px',
                        borderRadius: radius.sm,
                        backgroundColor: isActive ? colors.bg.surfaceSecondary : 'transparent',
                        color: isActive ? colors.text.primary : colors.text.muted,
                        border: `1px solid ${isActive ? colors.border.strong : colors.border.subtle}`,
                        cursor: 'pointer',
                      }}
                    >
                      {sev}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── View Mode: Grouped by Symbol ── */}
            {viewMode === 'grouped' ? (
              filteredGroups.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {filteredGroups.map((group: SymbolGroup, gIdx: number) => {
                    const rel = getRelativePath(group.file_path, repoPath);
                    const highestSev = group.highest_severity.toLowerCase();
                    const sevBadgeVariant =
                      highestSev === 'critical' || highestSev === 'high'
                        ? 'red'
                        : highestSev === 'medium'
                        ? 'yellow'
                        : 'default';

                    return (
                      <div
                        key={gIdx}
                        style={{
                          backgroundColor: colors.bg.surface,
                          border: `1px solid ${colors.border.default}`,
                          borderRadius: radius.lg,
                          padding: '14px 16px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '12px',
                        }}
                      >
                        {/* Header: Symbol & File */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <Badge variant={sevBadgeVariant as any}>{group.highest_severity.toUpperCase()}</Badge>
                            {group.entity_name ? (
                              <Badge variant="blue">{group.entity_name}()</Badge>
                            ) : (
                              <Badge variant="default">Module</Badge>
                            )}
                            <span style={{ fontSize: '12px', fontFamily: font.mono, color: colors.text.primary }}>
                              {rel}
                            </span>
                            {group.line && (
                              <span style={{ fontSize: '11px', color: colors.text.muted, fontFamily: font.mono }}>
                                Line {group.line}
                              </span>
                            )}
                            <span style={{ fontSize: '11px', color: colors.text.muted }}>
                              ({group.smell_count} finding{group.smell_count === 1 ? '' : 's'} on this symbol)
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleOpenFile(group.file_path)}
                              icon={<ExternalLink size={11} />}
                            >
                              Open file
                            </Button>
                          </div>
                        </div>

                        {/* List of issues affecting this symbol */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {group.smells.map((smell, sIdx) => (
                            <div
                              key={sIdx}
                              style={{
                                backgroundColor: colors.bg.surfaceSecondary,
                                border: `1px solid ${colors.border.subtle}`,
                                borderRadius: radius.md,
                                padding: '10px 12px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '6px',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: '12px', fontWeight: 600, color: colors.text.primary }}>
                                  {smell.message}
                                </span>
                                {smell.threshold && (
                                  <span style={{ fontSize: '11px', fontFamily: font.mono, color: colors.text.muted }}>
                                    Threshold: {smell.threshold} (Observed: {smell.observed})
                                  </span>
                                )}
                              </div>

                              <div style={{ display: 'flex', gap: '6px', fontSize: '11px' }}>
                                <span style={{ color: colors.text.muted, flexShrink: 0, fontWeight: 500 }}>Why it matters:</span>
                                <span style={{ color: colors.text.secondary }}>
                                  {smell.why_it_matters || 'Violates clean code maintainability.'}
                                </span>
                              </div>

                              <div style={{ display: 'flex', gap: '6px', fontSize: '11px', alignItems: 'center' }}>
                                <span style={{ color: colors.accent.blue, flexShrink: 0, fontWeight: 500 }}>Suggested action:</span>
                                <span style={{ color: colors.text.primary }}>
                                  {smell.suggestion || 'Refactor function into smaller units.'}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Ask AI footer */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              handleAskAI(
                                `How should I refactor ${group.entity_name || rel} which has ${group.smell_count} issues: ${group.smells.map((s) => s.message).join('; ')}`,
                                group.file_path
                              )
                            }
                            icon={<MessageSquare size={11} />}
                          >
                            Ask AI how to refactor this symbol
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div
                  style={{
                    backgroundColor: colors.bg.surface,
                    border: `1px solid ${colors.border.default}`,
                    borderRadius: radius.md,
                    padding: '24px',
                    textAlign: 'center',
                    fontSize: '12px',
                    color: colors.status.success,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                >
                  <CheckCircle2 size={16} />
                  <span>No symbol issues found matching the "{severityFilter}" filter.</span>
                </div>
              )
            ) : (
              /* ── View Mode: All Findings Flat List ── */
              filteredIssues.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {filteredIssues.map((issue, idx) => {
                    const rel = getRelativePath(issue.file, repoPath);
                    const sevBadge =
                      issue.severity === 'Critical' || issue.severity === 'High'
                        ? 'red'
                        : issue.severity === 'Medium'
                        ? 'yellow'
                        : 'default';

                    return (
                      <div
                        key={idx}
                        style={{
                          backgroundColor: colors.bg.surface,
                          border: `1px solid ${colors.border.default}`,
                          borderRadius: radius.lg,
                          padding: '14px 16px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px',
                        }}
                      >
                        {/* Top line: Severity, Confidence, File, Symbol */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <Badge variant={sevBadge as any}>{issue.severity}</Badge>
                            <span style={{ fontSize: '11px', color: colors.text.muted, fontStyle: 'italic' }}>
                              {issue.confidence}
                            </span>
                            <span style={{ color: colors.border.default }}>•</span>
                            <span style={{ fontSize: '12px', fontWeight: 600, fontFamily: font.mono, color: colors.text.primary }}>
                              {rel}
                            </span>
                            {issue.symbol && (
                              <Badge variant="blue">{issue.symbol}</Badge>
                            )}
                          </div>

                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleOpenFile(issue.file)}
                            icon={<ExternalLink size={11} />}
                          >
                            Open file
                          </Button>
                        </div>

                        {/* Problem Statement & Evidence */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: colors.text.primary }}>
                            {issue.problem}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '11px', color: colors.text.muted, fontFamily: font.mono }}>
                            <span>Evidence: {issue.evidence}</span>
                            {issue.threshold && (
                              <span>Threshold: {issue.threshold} (Observed: {issue.observed})</span>
                            )}
                          </div>
                        </div>

                        {/* Why it matters & Suggested action callout */}
                        <div
                          style={{
                            padding: '10px 12px',
                            borderRadius: radius.md,
                            backgroundColor: colors.bg.surfaceSecondary,
                            border: `1px solid ${colors.border.subtle}`,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px',
                          }}
                        >
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 600, color: colors.text.muted, flexShrink: 0 }}>
                              Why it matters:
                            </span>
                            <span style={{ fontSize: '11px', color: colors.text.secondary, lineHeight: 1.4 }}>
                              {issue.whyItMatters}
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <span style={{ fontSize: '11px', fontWeight: 600, color: colors.accent.blue, flexShrink: 0 }}>
                              Suggested action:
                            </span>
                            <span style={{ fontSize: '11px', color: colors.text.primary }}>
                              {issue.suggestedAction}
                            </span>
                          </div>
                        </div>

                        {/* Quick AI remediation button */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '4px' }}>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleAskAI(issue.problem, issue.file)}
                            icon={<MessageSquare size={11} />}
                          >
                            Ask AI how to fix this
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div
                  style={{
                    backgroundColor: colors.bg.surface,
                    border: `1px solid ${colors.border.default}`,
                    borderRadius: radius.md,
                    padding: '24px',
                    textAlign: 'center',
                    fontSize: '12px',
                    color: colors.status.success,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                >
                  <CheckCircle2 size={16} />
                  <span>No issues found matching the "{severityFilter}" filter.</span>
                </div>
              )
            )}
          </div>

          {/* ── Section D: Raw Codebase Telemetry (Collapsible) ── */}
          {stats && (
            <div
              style={{
                backgroundColor: colors.bg.surface,
                border: `1px solid ${colors.border.default}`,
                borderRadius: radius.lg,
                overflow: 'hidden',
              }}
            >
              <div
                onClick={() => setShowTelemetry(!showTelemetry)}
                style={{
                  padding: '14px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <BarChart3 size={15} style={{ color: colors.accent.blue }} />
                  <span style={{ fontSize: '12px', fontWeight: 600, color: colors.text.primary }}>
                    Raw Codebase Telemetry &amp; Static Measurements
                  </span>
                  <Badge variant="default">{stats.files_analyzed} files analyzed</Badge>
                </div>
                <div style={{ color: colors.text.muted }}>
                  {showTelemetry ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
              </div>

              {showTelemetry && (
                <div
                  style={{
                    padding: '16px 18px',
                    borderTop: `1px solid ${colors.border.subtle}`,
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '12px',
                    backgroundColor: colors.bg.primary,
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', backgroundColor: colors.bg.surfaceSecondary, padding: '10px 12px', borderRadius: radius.md, border: `1px solid ${colors.border.subtle}` }}>
                    <span style={{ fontSize: '11px', color: colors.text.muted }}>Lines of Code</span>
                    <span style={{ fontSize: '16px', fontWeight: 700, fontFamily: font.mono, color: colors.text.primary }}>{stats.total_lines.toLocaleString()}</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', backgroundColor: colors.bg.surfaceSecondary, padding: '10px 12px', borderRadius: radius.md, border: `1px solid ${colors.border.subtle}` }}>
                    <span style={{ fontSize: '11px', color: colors.text.muted }}>Functions / Methods</span>
                    <span style={{ fontSize: '16px', fontWeight: 700, fontFamily: font.mono, color: colors.text.primary }}>
                      {stats.total_functions} <span style={{ fontSize: '11px', color: colors.text.muted }}>({stats.documented_functions} documented)</span>
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', backgroundColor: colors.bg.surfaceSecondary, padding: '10px 12px', borderRadius: radius.md, border: `1px solid ${colors.border.subtle}` }}>
                    <span style={{ fontSize: '11px', color: colors.text.muted }}>Average Function Length</span>
                    <span style={{ fontSize: '16px', fontWeight: 700, fontFamily: font.mono, color: colors.text.primary }}>
                      {stats.average_function_length.toFixed(1)} <span style={{ fontSize: '11px', color: colors.text.muted }}>lines</span>
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', backgroundColor: colors.bg.surfaceSecondary, padding: '10px 12px', borderRadius: radius.md, border: `1px solid ${colors.border.subtle}` }}>
                    <span style={{ fontSize: '11px', color: colors.text.muted }}>Longest Function</span>
                    <span style={{ fontSize: '12px', fontWeight: 600, fontFamily: font.mono, color: stats.max_function_length > 80 ? colors.status.danger : colors.text.primary }}>
                      {stats.longest_function || `${stats.max_function_length} lines`}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', backgroundColor: colors.bg.surfaceSecondary, padding: '10px 12px', borderRadius: radius.md, border: `1px solid ${colors.border.subtle}` }}>
                    <span style={{ fontSize: '11px', color: colors.text.muted }}>Circular Dependency Cycles</span>
                    <span style={{ fontSize: '16px', fontWeight: 700, fontFamily: font.mono, color: stats.circular_dependencies > 0 ? colors.status.danger : colors.status.success }}>
                      {stats.circular_dependencies}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', backgroundColor: colors.bg.surfaceSecondary, padding: '10px 12px', borderRadius: radius.md, border: `1px solid ${colors.border.subtle}` }}>
                    <span style={{ fontSize: '11px', color: colors.text.muted }}>God Classes (&gt;15 methods)</span>
                    <span style={{ fontSize: '16px', fontWeight: 700, fontFamily: font.mono, color: stats.god_classes_count > 0 ? colors.status.warning : colors.status.success }}>
                      {stats.god_classes_count}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', backgroundColor: colors.bg.surfaceSecondary, padding: '10px 12px', borderRadius: radius.md, border: `1px solid ${colors.border.subtle}` }}>
                    <span style={{ fontSize: '11px', color: colors.text.muted }}>Oversized Files (&gt;500 lines)</span>
                    <span style={{ fontSize: '16px', fontWeight: 700, fontFamily: font.mono, color: stats.oversized_files_count > 0 ? colors.status.warning : colors.status.success }}>
                      {stats.oversized_files_count}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', backgroundColor: colors.bg.surfaceSecondary, padding: '10px 12px', borderRadius: radius.md, border: `1px solid ${colors.border.subtle}` }}>
                    <span style={{ fontSize: '11px', color: colors.text.muted }}>Hardcoded Secrets</span>
                    <span style={{ fontSize: '16px', fontWeight: 700, fontFamily: font.mono, color: stats.potential_secrets > 0 ? colors.status.danger : colors.status.success }}>
                      {stats.potential_secrets}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* ── Methodology Modal ── */}
      {showMethodology && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '24px',
          }}
          onClick={() => setShowMethodology(false)}
        >
          <div
            style={{
              backgroundColor: colors.bg.surface,
              border: `1px solid ${colors.border.strong}`,
              borderRadius: radius.lg,
              maxWidth: '680px',
              width: '100%',
              maxHeight: '85vh',
              overflowY: 'auto',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${colors.border.default}`, paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <HelpCircle size={18} style={{ color: colors.accent.blue }} />
                <h2 style={{ fontSize: '15px', fontWeight: 600, color: colors.text.primary, margin: 0 }}>
                  How Code Health Scoring Works
                </h2>
              </div>
              <button
                onClick={() => setShowMethodology(false)}
                style={{ background: 'none', border: 'none', color: colors.text.muted, cursor: 'pointer', padding: '4px' }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '12px', color: colors.text.secondary, lineHeight: 1.6 }}>
              <div>
                <strong style={{ color: colors.text.primary, fontSize: '13px' }}>1. Deterministic Static Analysis</strong>
                <p style={{ margin: '4px 0 0 0' }}>
                  Unlike AI-generated guesses or subjective reviews, every score is computed deterministically by the Tree-sitter AST parser and dependency graph analyzer. Scores are 100% reproducible and traceable.
                </p>
              </div>

              <div>
                <strong style={{ color: colors.text.primary, fontSize: '13px' }}>2. The 5 Pillars (20 Points Each)</strong>
                <ul style={{ margin: '4px 0 0 0', paddingLeft: '20px' }}>
                  <li><strong>Documentation (20%):</strong> Evaluates symbol docstring coverage on public classes/functions and module-level descriptions.</li>
                  <li><strong>Complexity (20%):</strong> Penalizes functions exceeding 50 lines (medium) and 80 lines (critical), and files exceeding 500 lines.</li>
                  <li><strong>Architecture (20%):</strong> Penalizes circular dependency loops between modules, excessive coupling, and dead code.</li>
                  <li><strong>Maintainability (20%):</strong> Evaluates cognitive load, average functions per file, and God classes (&gt;15 methods).</li>
                  <li><strong>Security (20%):</strong> Flags hardcoded API tokens, private keys, passwords, and sensitive credential assignments.</li>
                </ul>
              </div>

              <div>
                <strong style={{ color: colors.text.primary, fontSize: '13px' }}>3. Transparent Penalty Formula</strong>
                <p style={{ margin: '4px 0 0 0' }}>
                  Each dimension starts at a perfect score of <strong>20.0 points</strong>. Rule evaluations apply explicit point deductions based on defined threshold violations:
                </p>
                <div style={{ backgroundColor: colors.bg.surfaceSecondary, padding: '8px 12px', borderRadius: radius.md, fontFamily: font.mono, marginTop: '6px', color: colors.accent.blue }}>
                  Dimension Score = max(0.0, 20.0 - Σ Penalties)
                  <br />
                  Overall Health Score = Σ Dimension Scores (0 to 100)
                </div>
              </div>

              <div>
                <strong style={{ color: colors.text.primary, fontSize: '13px' }}>4. Grade System</strong>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px', marginTop: '6px' }}>
                  <div style={{ backgroundColor: colors.bg.surfaceSecondary, padding: '6px', textAlign: 'center', borderRadius: radius.sm }}><strong style={{ color: colors.status.success }}>A</strong> (90–100)</div>
                  <div style={{ backgroundColor: colors.bg.surfaceSecondary, padding: '6px', textAlign: 'center', borderRadius: radius.sm }}><strong style={{ color: colors.accent.blue }}>B</strong> (80–89)</div>
                  <div style={{ backgroundColor: colors.bg.surfaceSecondary, padding: '6px', textAlign: 'center', borderRadius: radius.sm }}><strong style={{ color: colors.status.warning }}>C</strong> (70–79)</div>
                  <div style={{ backgroundColor: colors.bg.surfaceSecondary, padding: '6px', textAlign: 'center', borderRadius: radius.sm }}><strong style={{ color: colors.status.warning }}>D</strong> (60–69)</div>
                  <div style={{ backgroundColor: colors.bg.surfaceSecondary, padding: '6px', textAlign: 'center', borderRadius: radius.sm }}><strong style={{ color: colors.status.danger }}>F</strong> (&lt; 60)</div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: `1px solid ${colors.border.default}`, paddingTop: '12px' }}>
              <Button variant="primary" size="sm" onClick={() => setShowMethodology(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HealthDashboard;
