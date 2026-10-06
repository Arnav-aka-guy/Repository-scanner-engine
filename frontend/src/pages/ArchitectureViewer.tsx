import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { apiPost } from '../services/api';
import {
  Tv,
  Loader2,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Shield,
  Layers,
  GitBranch,
  Code2,
  FileCode,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  MessageSquare,
  HelpCircle,
  Share2,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { colors, radius, font } from '../design-system/tokens';
import { Tooltip, Badge, Button, FilePath } from '../design-system/primitives';
import { ErrorCard } from '../components/ErrorCard';

interface ArchitectureViolation {
  source_file: string;
  target_file: string;
  source_layer: string;
  target_layer: string;
  description: string;
  severity?: 'critical' | 'high' | 'medium' | 'low';
}

interface ArchitectureReport {
  score: number;
  layers: Record<string, string[]>;
  circular_dependencies: string[][];
  dead_code: { id: string; label: string; node_type: string; file_path: string }[];
  violations: ArchitectureViolation[];
  strengths: string[];
  problems: string[];
  summary: string;
  stats: Record<string, number>;
}

/** Formats relative path from repository root */
function getRelativePath(fullPath: string, rootPath: string): string {
  const normRoot = rootPath.replace(/\\/g, '/').replace(/\/+$/, '');
  const normFile = fullPath.replace(/\\/g, '/');
  if (normRoot && normFile.startsWith(normRoot)) {
    return normFile.slice(normRoot.length).replace(/^\/+/, '');
  }
  return normFile;
}

export const ArchitectureViewer: React.FC = () => {
  const navigate = useNavigate();
  const repoPath = useWorkspaceStore((s) => s.activeRepository) || '';
  const setSelectedFile = useWorkspaceStore((s) => s.setSelectedFile);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ArchitectureReport | null>(null);
  const [expandedLayers, setExpandedLayers] = useState<Set<string>>(new Set());

  const runAnalysis = async () => {
    if (!repoPath) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiPost<ArchitectureReport>('/architecture/report', { repo_path: repoPath });
      setReport(res);
      setExpandedLayers(new Set(Object.keys(res.layers)));
    } catch (err: any) {
      setError(err.message || 'Architecture analysis failed.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (repoPath) {
      runAnalysis();
    }
  }, [repoPath]);

  const toggleLayer = (layer: string) => {
    setExpandedLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });
  };

  const handleOpenFile = (path: string) => {
    setSelectedFile(path);
    navigate('/explorer');
  };

  const handleAskAI = (context: string) => {
    navigate('/chat');
    setTimeout(() => {
      useWorkspaceStore.getState().sendChatMessage(`Explain architecture issue: ${context}`);
    }, 100);
  };

  // Human-readable rating label & color
  const rating = useMemo(() => {
    if (!report) return { label: 'Unknown', color: colors.text.muted, description: '' };
    if (report.score >= 80) {
      return {
        label: 'Good',
        color: colors.status.success,
        description: 'Clear layer separation, modular boundaries, and minimal circular couplings.',
      };
    }
    if (report.score >= 60) {
      return {
        label: 'Moderate',
        color: colors.status.warning,
        description: 'Noticeable architectural couplings or layer boundary violations present.',
      };
    }
    return {
      label: 'Needs Attention',
      color: colors.status.danger,
      description: 'Multiple architectural layer leaks or circular dependencies detected.',
    };
  }, [report]);

  // Standard Layer groups for presentation
  const standardLayers = ['Presentation', 'API', 'Services', 'Infrastructure', 'Unclassified'];

  return (
    <div
      className="flex-1 flex flex-col overflow-hidden w-full h-full select-none"
      style={{ backgroundColor: colors.bg.primary }}
    >
      {/* ── 1. Header ── */}
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: colors.accent.blue, display: 'flex', alignItems: 'center' }}>
              <Tv size={17} />
            </span>
            <h1
              style={{
                fontSize: font.size.base,
                fontWeight: 600,
                color: colors.text.primary,
                fontFamily: font.sans,
                margin: 0,
              }}
            >
              Architecture Health
            </h1>
            <Tooltip content="Verifies system topology against standard separation-of-concerns layers to detect boundary violations and dependency cycles.">
              <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                <Badge variant="default">Layer Boundaries</Badge>
              </span>
            </Tooltip>
          </div>
          <span style={{ fontSize: '12px', color: colors.text.secondary }}>
            Checks how the major parts of your project are organized and connected.
          </span>
        </div>

        <Button
          variant="primary"
          size="sm"
          onClick={runAnalysis}
          disabled={loading || !repoPath}
          loading={loading}
          icon={<Tv size={12} />}
        >
          Analyze Architecture
        </Button>
      </div>

      {/* ── 2. Content ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
        {error && (
          <div style={{ maxWidth: '960px', margin: '0 auto 16px', width: '100%' }}>
            <ErrorCard
              title="Architecture Analysis Error"
              whatHappened={error}
              why="The backend could not analyze the architectural layers or dependency cycles."
              whatCanIDo={[
                'Verify that the repository has been fully scanned and indexed.',
                'Check that the backend analysis server is healthy.',
                'Retry architectural analysis.',
              ]}
              onRetry={runAnalysis}
              retrying={loading}
            />
          </div>
        )}

        {loading ? (
          <div style={{ width: '100%', padding: '80px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
            <Loader2 size={28} className="animate-spin" style={{ color: colors.accent.blue }} />
            <span style={{ fontSize: '13px', color: colors.text.secondary, fontFamily: font.sans }}>
              Analyzing architecture layers, cycle topology, and boundary violations...
            </span>
          </div>
        ) : !repoPath ? (
          <div style={{ padding: '80px 0', textAlign: 'center', color: colors.text.muted, fontSize: '13px' }}>
            Open or scan a repository to analyze its architectural health.
          </div>
        ) : report ? (
          <div style={{ maxWidth: '960px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* ── Summary & Score Breakdown ── */}
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
              {/* Score Display */}
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
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                  <span
                    style={{
                      fontSize: '36px',
                      fontWeight: 700,
                      fontFamily: font.mono,
                      color: rating.color,
                      lineHeight: 1,
                    }}
                  >
                    {report.score}
                  </span>
                  <span style={{ fontSize: '13px', color: colors.text.muted, fontFamily: font.mono }}>
                    / 100
                  </span>
                </div>
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: rating.color,
                    marginTop: '6px',
                  }}
                >
                  {rating.label}
                </span>
              </div>

              {/* "Why this score?" Breakdown */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Sparkles size={14} style={{ color: colors.accent.blue }} />
                  <span style={{ fontSize: '12px', fontWeight: 600, color: colors.text.primary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Why this score?
                  </span>
                </div>

                <p style={{ fontSize: '12px', color: colors.text.secondary, margin: 0, lineHeight: 1.5 }}>
                  {rating.description} {report.summary}
                </p>

                {/* Dimensions pills */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginTop: '4px' }}>
                  <div style={{ padding: '8px', borderRadius: radius.md, backgroundColor: colors.bg.surfaceSecondary, border: `1px solid ${colors.border.subtle}`, textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', color: colors.text.muted, textTransform: 'uppercase' }}>Layers</div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: colors.text.primary, fontFamily: font.mono }}>{report.stats.total_layers || Object.keys(report.layers).length}</div>
                  </div>
                  <div style={{ padding: '8px', borderRadius: radius.md, backgroundColor: colors.bg.surfaceSecondary, border: `1px solid ${colors.border.subtle}`, textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', color: colors.text.muted, textTransform: 'uppercase' }}>Cycles</div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: (report.circular_dependencies?.length || 0) > 0 ? colors.status.danger : colors.status.success, fontFamily: font.mono }}>{report.circular_dependencies?.length || 0}</div>
                  </div>
                  <div style={{ padding: '8px', borderRadius: radius.md, backgroundColor: colors.bg.surfaceSecondary, border: `1px solid ${colors.border.subtle}`, textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', color: colors.text.muted, textTransform: 'uppercase' }}>Violations</div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: (report.violations?.length || 0) > 0 ? colors.status.warning : colors.status.success, fontFamily: font.mono }}>{report.violations?.length || 0}</div>
                  </div>
                  <div style={{ padding: '8px', borderRadius: radius.md, backgroundColor: colors.bg.surfaceSecondary, border: `1px solid ${colors.border.subtle}`, textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', color: colors.text.muted, textTransform: 'uppercase' }}>Unclassified</div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: colors.text.secondary, fontFamily: font.mono }}>{report.layers['Unclassified']?.length || 0}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Circular Dependency Loops Warning (if any) ── */}
            {report.circular_dependencies && report.circular_dependencies.length > 0 && (
              <div
                style={{
                  backgroundColor: 'rgba(201, 90, 90, 0.05)',
                  border: `1px solid ${colors.status.dangerBorder}`,
                  borderRadius: radius.lg,
                  padding: '16px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <GitBranch size={15} style={{ color: colors.status.danger }} />
                  <span style={{ fontSize: '12px', fontWeight: 600, color: colors.status.danger }}>
                    Circular Dependencies Detected ({report.circular_dependencies.length})
                  </span>
                </div>
                <p style={{ fontSize: '12px', color: colors.text.secondary, margin: 0, lineHeight: 1.5 }}>
                  Circular import loops cause tight coupling between modules, complicating testing and refactoring.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                  {report.circular_dependencies.map((cycle, cIdx) => (
                    <div
                      key={cIdx}
                      style={{
                        padding: '6px 10px',
                        borderRadius: radius.sm,
                        backgroundColor: colors.bg.primary,
                        border: `1px solid ${colors.border.subtle}`,
                        fontSize: '11px',
                        fontFamily: font.mono,
                        color: colors.text.primary,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        flexWrap: 'wrap',
                      }}
                    >
                      {cycle.map((p, pIdx) => (
                        <React.Fragment key={pIdx}>
                          <span style={{ color: colors.accent.blue }}>{getRelativePath(p, repoPath)}</span>
                          {pIdx < cycle.length - 1 && <span style={{ color: colors.text.muted }}>→</span>}
                        </React.Fragment>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Violations & Concerns ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: colors.text.muted }}>
                  Boundary Violations & Architectural Concerns ({report.violations?.length || 0})
                </span>
              </div>

              {report.violations && report.violations.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {report.violations.map((v, vIdx) => {
                    const srcRel = getRelativePath(v.source_file, repoPath);
                    const tgtRel = getRelativePath(v.target_file, repoPath);
                    return (
                      <div
                        key={vIdx}
                        style={{
                          backgroundColor: colors.bg.surface,
                          border: `1px solid ${colors.border.default}`,
                          borderRadius: radius.lg,
                          padding: '14px 16px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Badge variant="red">{v.severity || 'High Coupling'}</Badge>
                            <span style={{ fontSize: '12px', fontWeight: 600, color: colors.text.primary, fontFamily: font.mono }}>
                              {srcRel}
                            </span>
                          </div>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleOpenFile(v.source_file)}
                            icon={<ExternalLink size={11} />}
                          >
                            Open file
                          </Button>
                        </div>

                        <div style={{ fontSize: '12px', color: colors.text.secondary }}>
                          {v.description || `Module in ${v.source_layer} directly depends on ${tgtRel} in ${v.target_layer}.`}
                        </div>

                        <div
                          style={{
                            padding: '8px 10px',
                            borderRadius: radius.md,
                            backgroundColor: colors.bg.surfaceSecondary,
                            border: `1px solid ${colors.border.subtle}`,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '3px',
                          }}
                        >
                          <span style={{ fontSize: '11px', fontWeight: 600, color: colors.text.muted }}>
                            Why it matters:
                          </span>
                          <span style={{ fontSize: '11px', color: colors.text.secondary, lineHeight: 1.4 }}>
                            Changes to {tgtRel.split('/').pop()} may unexpectedly break consumers in higher-level layers, violating unidirectional architectural boundaries.
                          </span>
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
                    padding: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '12px',
                    color: colors.status.success,
                  }}
                >
                  <CheckCircle2 size={16} />
                  <span>No architectural layer boundary violations detected. Components respect modular boundaries.</span>
                </div>
              )}
            </div>

            {/* ── Architectural Layers ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: colors.text.muted }}>
                Architectural Layers ({Object.keys(report.layers).length})
              </span>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {Object.entries(report.layers).map(([layerName, fileList]) => {
                  const isExpanded = expandedLayers.has(layerName);
                  return (
                    <div
                      key={layerName}
                      style={{
                        backgroundColor: colors.bg.surface,
                        border: `1px solid ${colors.border.default}`,
                        borderRadius: radius.md,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        onClick={() => toggleLayer(layerName)}
                        style={{
                          padding: '10px 14px',
                          backgroundColor: isExpanded ? colors.bg.surfaceSecondary : 'transparent',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {isExpanded ? <ChevronDown size={14} style={{ color: colors.text.muted }} /> : <ChevronRight size={14} style={{ color: colors.text.muted }} />}
                          <span style={{ fontSize: '12px', fontWeight: 600, color: colors.text.primary }}>
                            {layerName}
                          </span>
                          <span style={{ fontSize: '11px', color: colors.text.muted }}>
                            ({fileList.length} {fileList.length === 1 ? 'file' : 'files'})
                          </span>
                        </div>
                      </div>

                      {isExpanded && (
                        <div
                          style={{
                            padding: '10px 14px',
                            borderTop: `1px solid ${colors.border.subtle}`,
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '6px',
                          }}
                        >
                          {fileList.map((f) => {
                            const rel = getRelativePath(f, repoPath);
                            return (
                              <div
                                key={f}
                                onClick={() => handleOpenFile(f)}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '3px 8px',
                                  borderRadius: radius.sm,
                                  backgroundColor: colors.bg.primary,
                                  border: `1px solid ${colors.border.default}`,
                                  fontSize: '11px',
                                  fontFamily: font.mono,
                                  color: colors.text.secondary,
                                  cursor: 'pointer',
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.borderColor = colors.accent.blue;
                                  e.currentTarget.style.color = colors.text.primary;
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.borderColor = colors.border.default;
                                  e.currentTarget.style.color = colors.text.secondary;
                                }}
                                title="Click to view file in Explorer"
                              >
                                <FileCode size={11} style={{ color: colors.accent.blue }} />
                                <span>{rel}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
