import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Folder,
  RefreshCw,
  FolderTree,
  MessageSquare,
  Search,
  Share2,
  Tv,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Compass,
  ArrowRight,
  FolderOpen,
} from 'lucide-react';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { apiGet } from '../services/api';
import { getOnboardingGuide, type RepoOnboardingGuide } from '../services/repository';
import {
  HealthScore,
  TechDebt,
  DependencyRisk,
  Dimension,
} from '../components/health/HealthTypes';
import { getHealthBand } from '../components/health/healthBands';
import { colors, radius, font } from '../design-system/tokens';
import { PageHeader } from '../design-system/PageHeader';
import {
  Button,
  Badge,
  Panel,
  SectionHeader,
  LoadingState,
} from '../design-system/primitives';

// Helper to format relative time
function formatLastScanned(dateString?: string): string {
  if (!dateString) return 'Not scanned yet';
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffSec < 60) return 'Just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateString;
  }
}

function getRepoBasename(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  return segments[segments.length - 1] || path;
}

function getRelativePath(fullPath: string, rootPath: string): string {
  const normRoot = rootPath.replace(/\\/g, '/').replace(/\/+$/, '');
  const normFile = fullPath.replace(/\\/g, '/');
  if (normRoot && normFile.startsWith(normRoot)) {
    return normFile.slice(normRoot.length).replace(/^\/+/, '');
  }
  return normFile;
}

export const Overview: React.FC = () => {
  const navigate = useNavigate();

  const activeRepository = useWorkspaceStore((s) => s.activeRepository);
  const activeRepositoryId = useWorkspaceStore((s) => s.activeRepositoryId);
  const queueChatMessage = useWorkspaceStore((s) => s.queueChatMessage);
  const repositoryInfo = useWorkspaceStore((s) => s.repositoryInfo);
  const scanStatus = useWorkspaceStore((s) => s.scanStatus);
  const scanRepo = useWorkspaceStore((s) => s.scanRepo);
  const selectLocalDirectory = useWorkspaceStore((s) => s.selectLocalDirectory);
  const recentRepositories = useWorkspaceStore((s) => s.recentRepositories);
  const setCachedHealthScore = useWorkspaceStore((s) => s.setCachedHealthScore);

  const [inputPath, setInputPath] = useState('');
  const [healthScore, setHealthScore] = useState<HealthScore | null>(null);
  const [techDebt, setTechDebt] = useState<TechDebt | null>(null);
  const [depRisk, setDepRisk] = useState<DependencyRisk | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);

  // Repository Walkthrough state (Feature 4)
  const setSelectedFile = useWorkspaceStore((s) => s.setSelectedFile);
  const [onboardingGuide, setOnboardingGuide] = useState<RepoOnboardingGuide | null>(null);
  const [showWalkthrough, setShowWalkthrough] = useState(false);
  const [walkthroughLoading, setWalkthroughLoading] = useState(false);

  // Reset walkthrough when active repo changes
  useEffect(() => {
    setOnboardingGuide(null);
    setShowWalkthrough(false);
  }, [activeRepository]);

  const handleToggleWalkthrough = async () => {
    if (!showWalkthrough && !onboardingGuide && activeRepository) {
      setWalkthroughLoading(true);
      try {
        const guide = await getOnboardingGuide(activeRepository, activeRepositoryId);
        setOnboardingGuide(guide);
      } catch (err) {
        console.error('Failed to load onboarding guide', err);
      } finally {
        setWalkthroughLoading(false);
      }
    }
    setShowWalkthrough(!showWalkthrough);
  };

  const handleOpenFile = (path: string) => {
    setSelectedFile(path);
    navigate('/explorer');
  };

  const handleAskAIAboutWalkthrough = () => {
    queueChatMessage('Explain the overall purpose, architecture structure, and data flow of this codebase.');
    navigate(activeRepositoryId ? `/app/repositories/${activeRepositoryId}/chat` : '/app');
  };

  const isScanning = scanStatus === 'scanning';

  const fetchHealthData = useCallback(async () => {
    if (!activeRepository) return;
    const cached = useWorkspaceStore.getState().cachedHealthScore[activeRepository];
    if (!cached) {
      setHealthLoading(true);
    }
    setHealthError(null);
    try {
      const params: Record<string, string> = { repo_path: activeRepository };
      if (activeRepositoryId) {
        params.repository_id = String(activeRepositoryId);
      }
      const [hs, td, dr] = await Promise.all([
        apiGet<HealthScore>('/health-score', params),
        apiGet<TechDebt>('/tech-debt', params).catch(() => null),
        apiGet<DependencyRisk>('/dependency-risk', params).catch(() => null),
      ]);

      if (hs) {
        setHealthScore(hs);
        setCachedHealthScore(activeRepository, hs);
      }
      if (td) setTechDebt(td);
      if (dr) setDepRisk(dr);
    } catch (err: unknown) {
      if (!useWorkspaceStore.getState().cachedHealthScore[activeRepository]) {
        const msg = err instanceof Error ? err.message : 'Failed to calculate health metrics.';
        setHealthError(msg);
      }
    } finally {
      setHealthLoading(false);
    }
  }, [activeRepository, activeRepositoryId, setCachedHealthScore]);

  // Fetch health and analysis data when repository is loaded
  useEffect(() => {
    if (!activeRepository) {
      setHealthScore(null);
      setTechDebt(null);
      setDepRisk(null);
      return;
    }

    const cached = useWorkspaceStore.getState().cachedHealthScore[activeRepository];
    if (cached) {
      setHealthScore(cached);
    }

    fetchHealthData();
  }, [activeRepository, activeRepositoryId, scanStatus, fetchHealthData]);

  const handleScanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputPath.trim()) {
      scanRepo(inputPath.trim());
    }
  };

  if (!activeRepository) {
    return (
      <div
        className="flex-1 overflow-y-auto p-6 md:p-12 flex flex-col items-center justify-center select-none"
        style={{ backgroundColor: colors.bg.primary }}
      >
        <div
          style={{
            maxWidth: '600px',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: '24px',
          }}
        >
          {/* Main Title & Description */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Compass size={20} style={{ color: colors.accent.blue }} />
              <h1
                style={{
                  fontSize: font.size.xl,
                  fontWeight: font.weight.bold,
                  color: colors.text.primary,
                  fontFamily: font.sans,
                }}
              >
                Repository Overview
              </h1>
            </div>
            <p
              style={{
                fontSize: font.size.sm,
                color: colors.text.secondary,
                lineHeight: '1.6',
                fontFamily: font.sans,
              }}
            >
              Select a repository to scan. Antigravity Engine parses the abstract syntax tree, maps module connections, evaluates technical health, and powers repository-aware AI assistance.
            </p>
          </div>

          {/* Path Input Form */}
          <Panel padding="20px">
            <form onSubmit={handleScanSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <label
                style={{
                  fontSize: font.size.xs,
                  fontWeight: font.weight.semibold,
                  color: colors.text.muted,
                  letterSpacing: '0',
                }}
              >
                Repository Folder or GitHub URL
              </label>

              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  value={inputPath}
                  onChange={(e) => setInputPath(e.target.value)}
                  placeholder="e.g. D:\projects\my-app or https://github.com/org/repo"
                  style={{
                    flex: 1,
                    height: '34px',
                    padding: '0 12px',
                    backgroundColor: colors.bg.primary,
                    border: `1px solid ${colors.border.default}`,
                    borderRadius: radius.md,
                    fontSize: font.size.sm,
                    color: colors.text.primary,
                    fontFamily: font.mono,
                    outline: 'none',
                  }}
                />

                <Button
                  type="button"
                  variant="secondary"
                  onClick={selectLocalDirectory}
                  icon={<FolderOpen size={14} />}
                  title="Browse local directory from your PC"
                >
                  Browse
                </Button>

                <Button
                  type="submit"
                  variant="primary"
                  disabled={!inputPath.trim() || isScanning}
                  loading={isScanning}
                >
                  Scan Repository
                </Button>
              </div>
            </form>
          </Panel>

          {/* Recent Repositories */}
          {recentRepositories && recentRepositories.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span
                style={{
                  fontSize: font.size.xs,
                  fontWeight: font.weight.semibold,
                  color: colors.text.muted,
                  letterSpacing: '0',
                }}
              >
                Recent Repositories
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {recentRepositories.slice(0, 5).map((repo) => (
                  <div
                    key={repo}
                    onClick={() => scanRepo(repo)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      backgroundColor: colors.bg.surface,
                      border: `1px solid ${colors.border.subtle}`,
                      borderRadius: radius.md,
                      cursor: 'pointer',
                      transition: `background-color 0.1s ease`,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = colors.bg.surfaceSecondary)}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = colors.bg.surface)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      <Folder size={14} style={{ color: colors.accent.blue, flexShrink: 0 }} />
                      <span
                        style={{
                          fontSize: font.size.sm,
                          fontFamily: font.mono,
                          color: colors.text.primary,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {repo}
                      </span>
                    </div>
                    <ArrowRight size={13} style={{ color: colors.text.muted, flexShrink: 0 }} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  const repoBasename = getRepoBasename(activeRepository);
  const totalFiles = repositoryInfo?.total_files || 0;
  const totalLines = repositoryInfo?.total_lines || 0;
  const lastScanned = formatLastScanned(repositoryInfo?.scanned_at);
  const languages = repositoryInfo?.languages || {};

  // Sort languages by file count
  const sortedLanguages = Object.entries(languages).sort((a, b) => b[1] - a[1]);

  // Overall health presentation using shared getHealthBand
  const overallScore = Math.round(healthScore?.total_score ?? 80);
  const healthBand = getHealthBand(overallScore);
  const healthGrade = healthBand.letter;
  const healthTone = { color: healthBand.color, badge: healthBand.badge, label: healthBand.label };

  // Attention Items calculation from real API responses
  const attentionItems: Array<{
    title: string;
    description: string;
    severity: 'warning' | 'danger' | 'info';
    action: () => void;
  }> = [];

  if (techDebt) {
    const complexitySmells = techDebt.smells_by_category?.complexity || 0;
    if (complexitySmells > 0) {
      attentionItems.push({
        title: `${complexitySmells} high-complexity function${complexitySmells > 1 ? 's' : ''}`,
        description: 'Exceeds function length or indentation nesting depth thresholds; harder to test and maintain.',
        severity: 'warning',
        action: () => navigate('/health-dashboard'),
      });
    }

    const docSmells = techDebt.smells_by_category?.documentation || 0;
    if (docSmells > 0) {
      attentionItems.push({
        title: `${docSmells} undocumented symbol${docSmells > 1 ? 's' : ''}`,
        description: 'Missing docstrings in exported functions and classes.',
        severity: 'info',
        action: () => navigate('/health-dashboard'),
      });
    }
  }

  if (depRisk) {
    const highRiskDeps = depRisk.risk_summary?.high || 0;
    if (highRiskDeps > 0) {
      attentionItems.push({
        title: `${highRiskDeps} high-risk dependenc${highRiskDeps > 1 ? 'ies' : 'y'}`,
        description: 'Vulnerable or unpinned packages detected in manifests.',
        severity: 'danger',
        action: () => navigate('/health-dashboard'),
      });
    } else if (depRisk.suggestions && depRisk.suggestions.length > 0) {
      attentionItems.push({
        title: `${depRisk.suggestions.length} dependency recommendation${depRisk.suggestions.length > 1 ? 's' : ''}`,
        description: depRisk.suggestions[0],
        severity: 'info',
        action: () => navigate('/health-dashboard'),
      });
    }
  }

  return (
    <div className="flex-1 overflow-y-auto bg-ink">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-8 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      <PageHeader
        icon={<Folder size={19} />}
        title={repoBasename}
        meta={
          <>
            <span className="max-w-full truncate font-mono text-[12.5px] text-fg-3" title={activeRepository}>
              {activeRepository}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock size={13} />
              Scanned {lastScanned}
            </span>
          </>
        }
        actions={
          <>
            <Button
              variant={showWalkthrough ? 'primary' : 'secondary'}
              icon={<Compass size={15} />}
              onClick={handleToggleWalkthrough}
            >
              {showWalkthrough ? 'Close Guide' : 'Understand Repository'}
            </Button>
            <Button
              variant="secondary"
              icon={<RefreshCw size={15} className={isScanning ? 'animate-spin' : ''} />}
              onClick={() => scanRepo(activeRepository)}
              disabled={isScanning}
            >
              Rescan
            </Button>
            <Button variant="secondary" icon={<FolderTree size={15} />} onClick={() => navigate('/explorer')}>
              Open Explorer
            </Button>
            <Button variant="primary" icon={<MessageSquare size={15} />} onClick={() => navigate('/chat')}>
              Ask Assistant
            </Button>
          </>
        }
      />

      {showWalkthrough && (
        <section
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            backgroundColor: colors.bg.surface,
            border: `1px solid ${colors.border.default}`,
            borderRadius: radius.lg,
            padding: '18px 20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Compass size={17} style={{ color: colors.accent.blue }} />
                <h2
                  style={{
                    fontSize: font.size.base,
                    fontWeight: font.weight.semibold,
                    color: colors.text.primary,
                    margin: 0,
                  }}
                >
                  Understand this repository
                </h2>
                <Badge variant="blue">Guided Walkthrough</Badge>
              </div>
              <p style={{ fontSize: font.size.xs, color: colors.text.secondary, margin: 0 }}>
                A quick technical orientation: architecture overview, entry points, data flow, and key files.
              </p>
            </div>

            <Button variant="ghost" size="sm" onClick={() => setShowWalkthrough(false)}>
              Close
            </Button>
          </div>

          {walkthroughLoading ? (
            <LoadingState label="Synthesizing repository architecture & entry points..." size="sm" />
          ) : onboardingGuide ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: '12px',
                }}
              >
                {/* 1. Purpose */}
                <div
                  style={{
                    padding: '12px',
                    borderRadius: radius.md,
                    backgroundColor: colors.bg.surfaceSecondary,
                    border: `1px solid ${colors.border.subtle}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: colors.accent.blue, fontFamily: font.mono }}>01</span>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: colors.text.muted, letterSpacing: '0' }}>
                      Purpose
                    </span>
                  </div>
                  <span style={{ fontSize: '12px', color: colors.text.primary, lineHeight: '1.5' }}>
                    {onboardingGuide.purpose}
                  </span>
                </div>

                {/* 2. Architecture Overview */}
                <div
                  style={{
                    padding: '12px',
                    borderRadius: radius.md,
                    backgroundColor: colors.bg.surfaceSecondary,
                    border: `1px solid ${colors.border.subtle}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: colors.accent.blue, fontFamily: font.mono }}>02</span>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: colors.text.muted, letterSpacing: '0' }}>
                      Architecture Overview
                    </span>
                  </div>
                  <span style={{ fontSize: '12px', color: colors.text.primary, lineHeight: '1.5' }}>
                    {onboardingGuide.architecture_overview}
                  </span>
                </div>

                {/* 5. How Data Flows */}
                <div
                  style={{
                    padding: '12px',
                    borderRadius: radius.md,
                    backgroundColor: colors.bg.surfaceSecondary,
                    border: `1px solid ${colors.border.subtle}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: colors.accent.blue, fontFamily: font.mono }}>03</span>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: colors.text.muted, letterSpacing: '0' }}>
                      Data Flow
                    </span>
                  </div>
                  <span style={{ fontSize: '12px', color: colors.text.primary, lineHeight: '1.5' }}>
                    {onboardingGuide.data_flow}
                  </span>
                </div>

                {/* 6. Key Dependencies */}
                <div
                  style={{
                    padding: '12px',
                    borderRadius: radius.md,
                    backgroundColor: colors.bg.surfaceSecondary,
                    border: `1px solid ${colors.border.subtle}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: colors.accent.blue, fontFamily: font.mono }}>04</span>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: colors.text.muted, letterSpacing: '0' }}>
                      Dependencies & Modules
                    </span>
                  </div>
                  <span style={{ fontSize: '12px', color: colors.text.primary, lineHeight: '1.5' }}>
                    {onboardingGuide.dependencies_summary}
                  </span>
                </div>
              </div>

              {/* 3. Entry Points & 4. Important Files & 7. Known Issues & 8. Starting Points */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: '12px',
                }}
              >
                {/* 05 Entry Points */}
                <div
                  style={{
                    padding: '12px',
                    borderRadius: radius.md,
                    backgroundColor: colors.bg.surfaceSecondary,
                    border: `1px solid ${colors.border.subtle}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: colors.accent.blue, fontFamily: font.mono }}>05</span>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: colors.text.muted, letterSpacing: '0' }}>
                      Entry Points ({onboardingGuide.entry_points.length})
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {onboardingGuide.entry_points.length > 0 ? (
                      onboardingGuide.entry_points.map((ep, idx) => (
                        <div
                          key={idx}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '4px 8px',
                            background: colors.bg.primary,
                            borderRadius: radius.sm,
                            fontSize: '11px',
                            fontFamily: font.mono,
                          }}
                        >
                          <span style={{ color: colors.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }} title={ep}>
                            {getRelativePath(ep, activeRepository)}
                          </span>
                          <button
                            onClick={() => handleOpenFile(ep)}
                            style={{ background: 'none', border: 'none', color: colors.accent.blue, cursor: 'pointer', fontSize: '10px' }}
                          >
                            Open
                          </button>
                        </div>
                      ))
                    ) : (
                      <span style={{ fontSize: '11px', color: colors.text.muted, fontStyle: 'italic' }}>
                        No standard entry points identified.
                      </span>
                    )}
                  </div>
                </div>

                {/* 06 Important Files */}
                <div
                  style={{
                    padding: '12px',
                    borderRadius: radius.md,
                    backgroundColor: colors.bg.surfaceSecondary,
                    border: `1px solid ${colors.border.subtle}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: colors.accent.blue, fontFamily: font.mono }}>06</span>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: colors.text.muted, letterSpacing: '0' }}>
                      Important Files ({onboardingGuide.important_files.length})
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '110px', overflowY: 'auto' }}>
                    {onboardingGuide.important_files.map((imp, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '4px 8px',
                          background: colors.bg.primary,
                          borderRadius: radius.sm,
                          fontSize: '11px',
                          fontFamily: font.mono,
                        }}
                      >
                        <span style={{ color: colors.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }} title={imp}>
                          {getRelativePath(imp, activeRepository)}
                        </span>
                        <button
                          onClick={() => handleOpenFile(imp)}
                          style={{ background: 'none', border: 'none', color: colors.accent.blue, cursor: 'pointer', fontSize: '10px' }}
                        >
                          Open
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 07 Known Issues / Debt */}
                <div
                  style={{
                    padding: '12px',
                    borderRadius: radius.md,
                    backgroundColor: colors.bg.surfaceSecondary,
                    border: `1px solid ${colors.border.subtle}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: colors.accent.blue, fontFamily: font.mono }}>07</span>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: colors.text.muted, letterSpacing: '0' }}>
                      Known Issues / Debt
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {onboardingGuide.known_issues.map((issue, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', fontSize: '11px', color: colors.text.secondary }}>
                        <AlertTriangle size={11} style={{ color: colors.status.warning, marginTop: '2px', flexShrink: 0 }} />
                        <span>{issue}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 08 Where Should I Start? */}
                <div
                  style={{
                    padding: '12px',
                    borderRadius: radius.md,
                    backgroundColor: colors.bg.surfaceSecondary,
                    border: `1px solid ${colors.border.subtle}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: colors.accent.blue, fontFamily: font.mono }}>08</span>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: colors.text.muted, letterSpacing: '0' }}>
                      Where Should I Start?
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {onboardingGuide.starting_points.map((sp, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '4px 8px',
                          background: colors.bg.primary,
                          borderRadius: radius.sm,
                          fontSize: '11px',
                          fontFamily: font.mono,
                        }}
                      >
                        <span style={{ color: colors.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }} title={sp}>
                          {getRelativePath(sp, activeRepository)}
                        </span>
                        <button
                          onClick={() => handleOpenFile(sp)}
                          style={{ background: 'none', border: 'none', color: colors.accent.blue, cursor: 'pointer', fontSize: '10px' }}
                        >
                          Explore
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Bottom Actions */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', paddingTop: '8px', borderTop: `1px solid ${colors.border.subtle}` }}>
                {onboardingGuide.entry_points.length > 0 && (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<FolderTree size={12} />}
                    onClick={() => handleOpenFile(onboardingGuide.entry_points[0])}
                  >
                    Open entry point
                  </Button>
                )}
                <Button
                  variant="primary"
                  size="sm"
                  icon={<MessageSquare size={12} />}
                  onClick={handleAskAIAboutWalkthrough}
                >
                  Ask AI about this
                </Button>
              </div>
            </div>
          ) : (
            <span style={{ fontSize: '12px', color: colors.text.muted }}>
              Click below to generate the repository orientation walkthrough.
            </span>
          )}
        </section>
      )}

      <section className="flex flex-col gap-4">
        <SectionHeader label="Repository Summary" description="Size, code volume and the main languages found in the scan." />
        <div className="grid grid-cols-2 overflow-hidden rounded-[12px] border border-line bg-surface lg:grid-cols-4">
          <div className="border-b border-r border-line-soft p-5 lg:border-b-0">
            <div className="text-[13px] text-fg-3">Source files</div>
            <div className="mt-2 text-[32px] font-semibold leading-none tracking-[-0.02em] tabular-nums">{totalFiles.toLocaleString()}</div>
            <div className="mt-2 text-[12.5px] text-fg-4">Indexed in workspace tree</div>
          </div>
          <div className="border-b border-line-soft p-5 lg:border-b-0 lg:border-r">
            <div className="text-[13px] text-fg-3">Total lines</div>
            <div className="mt-2 text-[32px] font-semibold leading-none tracking-[-0.02em] tabular-nums">{totalLines.toLocaleString()}</div>
            <div className="mt-2 text-[12.5px] text-fg-4">Lines of code parsed</div>
          </div>
          <div className="border-r border-line-soft p-5">
            <div className="text-[13px] text-fg-3">Primary languages</div>
            {sortedLanguages.length > 0 ? (
              <div className="mt-3 flex flex-col gap-2">
                {sortedLanguages.slice(0, 3).map(([lang, count]) => {
                  const total = sortedLanguages.reduce((sum, [, c]) => sum + c, 0) || 1;
                  return (
                    <div key={lang} className="flex items-center gap-2.5 text-[13px]">
                      <span className="w-[84px] truncate text-fg-2">{lang}</span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                        <span className="block h-full rounded-full bg-iris" style={{ width: `${Math.max(4, (count / total) * 100)}%` }} />
                      </span>
                      <span className="w-8 text-right tabular-nums text-fg-3">{count}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mt-3 text-[13px] text-fg-4">None detected</div>
            )}
          </div>
          <div className="p-5">
            <div className="text-[13px] text-fg-3">Index status</div>
            <div className="mt-2.5 flex items-center gap-2 text-[17px] font-semibold">
              <span className={`h-2 w-2 rounded-full ${scanStatus === 'indexed' ? 'bg-mint' : isScanning ? 'bg-ion live-dot' : 'bg-fg-4'}`} />
              {scanStatus === 'indexed' ? 'Indexed & Ready' : isScanning ? 'Indexing…' : 'Not indexed'}
            </div>
            <div className="mt-2 text-[12.5px] text-fg-4">Code structure and search index are up to date</div>
          </div>
        </div>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <SectionHeader label="Code Health" />
              <Badge variant={healthTone.badge}>{healthTone.label}</Badge>
            </div>
            <span
              style={{
                fontSize: font.size.sm,
                color: colors.text.secondary,
                marginTop: '2px',
                display: 'block',
              }}
            >
              An overall estimate of how easy this repository is to understand, maintain, and modify.
            </span>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/health-dashboard')}
            icon={<ArrowRight size={13} />}
          >
            View Details
          </Button>
        </div>

        {healthLoading ? (
          <Panel padding="24px">
            <LoadingState label="Computing health dimensions and analyzing code debt..." />
          </Panel>
        ) : healthError && !healthScore ? (
          <Panel padding="20px" style={{ borderLeft: `3px solid ${colors.status.danger}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <div>
                <span style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.status.danger }}>
                  Health Metrics Unavailable
                </span>
                <p style={{ fontSize: font.size.xs, color: colors.text.secondary, marginTop: '4px' }}>
                  {healthError}
                </p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => fetchHealthData()} icon={<RefreshCw size={12} />}>
                Retry
              </Button>
            </div>
          </Panel>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '12px',
            }}
          >
            {/* Overall Score Highlight */}
            <Panel
              padding="16px"
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                borderLeft: `3px solid ${healthTone.color}`,
              }}
            >
              <div>
                <span
                  style={{
                    fontSize: font.size.xs,
                    fontWeight: font.weight.semibold,
                    color: colors.text.muted,
                    letterSpacing: '0',
                  }}
                >
                  Quality Score
                </span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '4px' }}>
                  <span
                    style={{
                      fontSize: font.size['3xl'],
                      fontWeight: font.weight.bold,
                      color: colors.text.primary,
                      fontFamily: font.mono,
                    }}
                  >
                    {overallScore}
                  </span>
                  <span style={{ fontSize: font.size.md, color: colors.text.muted }}>/ 100</span>
                  <span
                    style={{
                      fontSize: font.size.sm,
                      color: healthTone.color,
                      fontWeight: font.weight.semibold,
                      marginLeft: '6px',
                    }}
                  >
                    Grade {healthGrade}
                  </span>
                </div>
              </div>
              <p
                style={{
                  fontSize: font.size.xs,
                  color: colors.text.secondary,
                  marginTop: '10px',
                  lineHeight: '1.5',
                }}
              >
                {healthScore?.summary || 'Codebase adheres to standard architectural guidelines.'}
              </p>
            </Panel>

            {/* 5 Core Dimensions */}
            {(healthScore?.dimensions || [
              { name: 'Architecture', score: 18, max_score: 20, deductions: [] },
              { name: 'Security', score: 20, max_score: 20, deductions: [] },
              { name: 'Maintainability', score: 16, max_score: 20, deductions: [] },
              { name: 'Complexity', score: 15, max_score: 20, deductions: [] },
              { name: 'Documentation', score: 14, max_score: 20, deductions: [] },
            ]).map((dim) => {
              const pct = Math.round((dim.score / (dim.max_score || 20)) * 100);
              const hasDeductions = dim.deductions && dim.deductions.length > 0;
              const explanation = hasDeductions
                ? (typeof dim.deductions[0] === 'string' ? dim.deductions[0] : (dim.deductions[0] as { reason?: string })?.reason || 'Criteria assessed')
                : 'Meets standard maintainability criteria';

              return (
                <Panel key={dim.name} padding="14px">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span
                      style={{
                        fontSize: font.size.sm,
                        fontWeight: font.weight.semibold,
                        color: colors.text.primary,
                      }}
                    >
                      {dim.name}
                    </span>
                    <span
                      style={{
                        fontSize: font.size.xs,
                        fontFamily: font.mono,
                        color: pct >= 80 ? colors.status.success : pct >= 60 ? colors.status.warning : colors.status.danger,
                      }}
                    >
                      {dim.score} / {dim.max_score || 20}
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div
                    style={{
                      width: '100%',
                      height: '4px',
                      borderRadius: '2px',
                      backgroundColor: colors.bg.surfaceSecondary,
                      overflow: 'hidden',
                      marginTop: '8px',
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.min(100, pct)}%`,
                        height: '100%',
                        backgroundColor: pct >= 80 ? colors.status.success : pct >= 60 ? colors.status.warning : colors.status.danger,
                      }}
                    />
                  </div>

                  <span
                    style={{
                      fontSize: '11px',
                      color: colors.text.muted,
                      marginTop: '6px',
                      display: 'block',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={explanation}
                  >
                    {explanation}
                  </span>
                </Panel>
              );
            })}
          </div>
        )}
      </section>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '16px',
        }}
      >
        {/* Left Column: Needs Attention Section */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <SectionHeader
            label="Needs Attention"
            description="Potential risks, unpinned dependencies, and complexity hotspots."
          />

          <Panel padding="0">
            {attentionItems.length === 0 ? (
              <div
                style={{
                  padding: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  color: colors.status.success,
                  fontSize: font.size.sm,
                }}
              >
                <CheckCircle2 size={18} />
                <span>No high-priority issues detected in current scan.</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {attentionItems.map((item, idx) => (
                  <div
                    key={idx}
                    onClick={item.action}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      padding: '12px 16px',
                      borderBottom: idx < attentionItems.length - 1 ? `1px solid ${colors.border.subtle}` : 'none',
                      cursor: 'pointer',
                      transition: `background-color 0.1s ease`,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = colors.bg.surfaceSecondary)}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                      <AlertTriangle
                        size={15}
                        style={{
                          color: item.severity === 'danger' ? colors.status.danger : colors.status.warning,
                          marginTop: '2px',
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span
                          style={{
                            fontSize: font.size.sm,
                            fontWeight: font.weight.medium,
                            color: colors.text.primary,
                          }}
                        >
                          {item.title}
                        </span>
                        <span style={{ fontSize: font.size.xs, color: colors.text.muted }}>
                          {item.description}
                        </span>
                      </div>
                    </div>

                    <ArrowRight size={13} style={{ color: colors.text.muted, marginTop: '4px', flexShrink: 0 }} />
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </section>

        {/* Right Column: Quick Actions Section */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <SectionHeader
            label="What Can I Do Next?"
            description="Explore components, verify architecture, and consult AI."
          />

          <Panel padding="6px">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {[
                {
                  title: 'Explore source tree & AST symbols',
                  subtitle: 'Inspect functions, classes, and code syntax highlighting',
                  icon: <FolderTree size={16} />,
                  path: '/explorer',
                },
                {
                  title: 'Semantic code search',
                  subtitle: 'Find relevant functions via vector embeddings',
                  icon: <Search size={16} />,
                  path: '/search',
                },
                {
                  title: 'Ask AI assistant',
                  subtitle: 'Inquire about repository architecture, bugs, or logic',
                  icon: <MessageSquare size={16} />,
                  path: '/chat',
                },
                {
                  title: 'Inspect dependency & call graphs',
                  subtitle: 'Trace file imports, modules, and cross-file dependencies',
                  icon: <Share2 size={16} />,
                  path: '/graph',
                },
                {
                  title: 'Review architecture layers',
                  subtitle: 'Verify layer isolation and circular references',
                  icon: <Tv size={16} />,
                  path: '/architecture',
                },
                {
                  title: 'Generate repository documentation',
                  subtitle: 'Produce structured markdown manuals and module docs',
                  icon: <FileText size={16} />,
                  path: '/documentation',
                },
              ].map((action, idx) => (
                <div
                  key={idx}
                  onClick={() => navigate(action.path)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: radius.md,
                    cursor: 'pointer',
                    transition: `background-color 0.1s ease`,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = colors.bg.surfaceSecondary)}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ color: colors.accent.blue, display: 'flex', alignItems: 'center' }}>
                      {action.icon}
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span
                        style={{
                          fontSize: font.size.sm,
                          fontWeight: font.weight.medium,
                          color: colors.text.primary,
                        }}
                      >
                        {action.title}
                      </span>
                      <span style={{ fontSize: font.size.xs, color: colors.text.muted }}>
                        {action.subtitle}
                      </span>
                    </div>
                  </div>

                  <ArrowRight size={13} style={{ color: colors.text.muted }} />
                </div>
              ))}
            </div>
          </Panel>
        </section>
      </div>
      </div>
    </div>
  );
};
