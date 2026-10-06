import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { apiGet } from '../services/api';
import {
  HealthScore,
  TechDebt,
  DependencyRisk,
  SmellItem,
  Dimension,
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
  ExternalLink,
  MessageSquare,
  Sparkles,
  SlidersHorizontal,
  Info,
} from 'lucide-react';
import { colors, radius, font } from '../design-system/tokens';
import { Tooltip, Badge, Button, FilePath } from '../design-system/primitives';

/** Formats relative path from repository root */
function getRelativePath(fullPath: string, rootPath: string): string {
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
  const [severityFilter, setSeverityFilter] = useState<'all' | 'critical' | 'high' | 'medium' | 'low'>('all');

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
        label: 'Good',
        color: colors.status.success,
        description: 'Codebase adheres to standard architectural guidelines and has minimal technical debt.',
      };
    }
    if (score >= 60) {
      return {
        label: 'Needs Review',
        color: colors.status.warning,
        description: 'Some complexity hotspots or unmaintained modules were detected that require review.',
      };
    }
    return {
      label: 'Needs Attention',
      color: colors.status.danger,
      description: 'Multiple high-risk maintenance issues, high complexity, or poor documentation identified.',
    };
  }, [healthScore]);

  // Dimension explanation mappings
  const dimensionDescriptions: Record<string, string> = {
    Documentation: 'Measures docstring coverage and symbol clarity for public functions and classes.',
    Complexity: 'Evaluates cyclomatic nesting depth and function length across modules.',
    Architecture: 'Checks for clear layer boundaries, modularity, and lack of circular import cycles.',
    Maintainability: 'Assesses code smell density, duplicate logic, and cognitive load.',
    Security: 'Detects hardcoded secrets, unsafe library dependencies, and missing input sanitization.',
  };

  // Issues extraction
  const issuesList = useMemo(() => {
    const list: Array<{
      severity: 'Critical' | 'High' | 'Medium' | 'Low';
      confidence: 'High-confidence issue' | 'Potential issue' | 'Needs review';
      file: string;
      symbol?: string;
      category: string;
      problem: string;
      evidence: string;
      whyItMatters: string;
      suggestedAction: string;
    }> = [];

    // From techDebt smells
    if (techDebt?.all_smells) {
      for (const smell of techDebt.all_smells) {
        const sev = (smell.severity || 'medium').toLowerCase();
        const sevLabel: 'Critical' | 'High' | 'Medium' | 'Low' =
          sev === 'critical' ? 'Critical' : sev === 'high' ? 'High' : sev === 'low' ? 'Low' : 'Medium';

        const confLabel: 'High-confidence issue' | 'Potential issue' | 'Needs review' =
          sevLabel === 'Critical' || sevLabel === 'High' ? 'High-confidence issue' : 'Potential issue';

        let whyItMatters = 'May complicate onboarding, refactoring, or maintenance of this module.';
        if (smell.category === 'complexity') {
          whyItMatters = 'Functions with high branching logic are prone to runtime bugs and are difficult to unit test.';
        } else if (smell.category === 'documentation') {
          whyItMatters = 'New contributors will need to read implementation internals to understand expected parameters and return types.';
        } else if (smell.category === 'maintainability') {
          whyItMatters = 'Long parameter lists or large modules make code brittle and resistant to refactoring.';
        }

        list.push({
          severity: sevLabel,
          confidence: confLabel,
          file: smell.file_path,
          symbol: smell.entity_name || undefined,
          category: smell.category || 'General',
          problem: smell.message,
          evidence: smell.line ? `Line ${smell.line}` : 'Module level',
          whyItMatters,
          suggestedAction: smell.suggestion || 'Review function design and reduce cyclomatic complexity.',
        });
      }
    }

    // Top offenders fallback if all_smells is empty
    if (list.length === 0 && techDebt?.top_offenders) {
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
        <span style={{ fontSize: '13px', color: colors.text.secondary }}>Computing multi-dimensional health metrics...</span>
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
              Code Health & Technical Debt
            </h1>
            <Badge variant="default">Maintenance Dashboard</Badge>
          </div>
          <span style={{ fontSize: '12px', color: colors.text.secondary }}>
            A transparent evaluation of maintainability, documentation, and technical debt across your codebase.
          </span>
        </div>
      </div>

      {/* ── 2. Scrollable Body ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* ── Section A: Overall Health Summary & Score Transparency ── */}
          <div
            style={{
              backgroundColor: colors.bg.surface,
              border: `1px solid ${colors.border.default}`,
              borderRadius: radius.lg,
              padding: '20px 24px',
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              gap: '24px',
              alignItems: 'center',
            }}
          >
            {/* Score */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                paddingRight: '24px',
                borderRight: `1px solid ${colors.border.subtle}`,
                minWidth: '140px',
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
              <span style={{ fontSize: '12px', fontWeight: 600, color: healthStatus.color, marginTop: '6px' }}>
                {healthStatus.label}
              </span>
            </div>

            {/* Explanation */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Sparkles size={14} style={{ color: colors.accent.blue }} />
                <span style={{ fontSize: '12px', fontWeight: 600, color: colors.text.primary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Score Composition & Transparency
                </span>
              </div>
              <p style={{ fontSize: '12px', color: colors.text.secondary, margin: 0, lineHeight: 1.5 }}>
                {healthStatus.description} {healthScore.summary}
              </p>
              <span style={{ fontSize: '11px', color: colors.text.muted }}>
                Scoring is computed across 5 weighted dimensions (Documentation, Complexity, Architecture, Maintainability, Security) evaluated from AST parsing and static dependency extraction.
              </span>
            </div>
          </div>

          {/* ── Section B: Dimensions (5 Dimensions with One-line Explanations) ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: colors.text.muted }}>
              Health Dimensions (5 Pillars)
            </span>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
              {healthScore.dimensions.map((dim: Dimension) => {
                const pct = Math.round((dim.score / dim.max_score) * 100);
                const statusColor = pct >= 80 ? colors.status.success : pct >= 60 ? colors.status.warning : colors.status.danger;
                const statusLabel = pct >= 80 ? 'Healthy' : pct >= 60 ? 'Needs Review' : 'At Risk';
                return (
                  <div
                    key={dim.name}
                    style={{
                      backgroundColor: colors.bg.surface,
                      border: `1px solid ${colors.border.default}`,
                      borderRadius: radius.md,
                      padding: '12px 14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: colors.text.primary }}>
                        {dim.name}
                      </span>
                      <span style={{ fontSize: '10px', fontWeight: 600, color: statusColor, padding: '1px 5px', borderRadius: radius.sm, backgroundColor: colors.bg.surfaceSecondary }}>
                        {statusLabel}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '3px' }}>
                      <span style={{ fontSize: '20px', fontWeight: 700, fontFamily: font.mono, color: statusColor }}>
                        {dim.score}
                      </span>
                      <span style={{ fontSize: '11px', color: colors.text.muted, fontFamily: font.mono }}>
                        / {dim.max_score}
                      </span>
                    </div>

                    <span style={{ fontSize: '11px', color: colors.text.secondary, lineHeight: 1.4, minHeight: '32px' }}>
                      {dimensionDescriptions[dim.name] || 'Evaluates codebase health standard.'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Section C: Prioritized Issues & Remediation ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: colors.text.muted }}>
                  Prioritized Code Quality Issues ({filteredIssues.length})
                </span>
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

            {/* Issues list */}
            {filteredIssues.length > 0 ? (
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
                        <span style={{ fontSize: '11px', color: colors.text.muted, fontFamily: font.mono }}>
                          Evidence: {issue.evidence}
                        </span>
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
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default HealthDashboard;
