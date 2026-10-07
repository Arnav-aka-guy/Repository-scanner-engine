import React, { useEffect, useState } from 'react';
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
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Compass,
  ArrowRight,
  Shield,
  Layers,
  Code2,
  HelpCircle,
  FolderOpen,
  BookOpen,
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
import { colors, radius, font } from '../design-system/tokens';
import {
  Button,
  Badge,
  Panel,
  SectionHeader,
  FilePath,
  LoadingState,
  Divider,
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
  const repositoryInfo = useWorkspaceStore((s) => s.repositoryInfo);
  const scanStatus = useWorkspaceStore((s) => s.scanStatus);
  const scanRepo = useWorkspaceStore((s) => s.scanRepo);
  const selectLocalDirectory = useWorkspaceStore((s) => s.selectLocalDirectory);
  const recentRepositories = useWorkspaceStore((s) => s.recentRepositories);
  const setRepoModalOpen = useWorkspaceStore((s) => s.setRepoModalOpen);

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
        const guide = await getOnboardingGuide(activeRepository);
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
    navigate('/chat');
    setTimeout(() => {
      const store = useWorkspaceStore.getState();
      store.sendChatMessage('Explain the overall purpose, architecture structure, and data flow of this codebase.');
    }, 100);
  };

  const isScanning = scanStatus === 'scanning';

  // Fetch health and analysis data when repository is loaded
  useEffect(() => {
    if (!activeRepository) {
      setHealthScore(null);
      setTechDebt(null);
      setDepRisk(null);
      return;
    }

    let isMounted = true;
    const fetchHealthData = async () => {
      setHealthLoading(true);
      setHealthError(null);
      try {
        const [hs, td, dr] = await Promise.all([
          apiGet<HealthScore>('/health-score', { repo_path: activeRepository }).catch(() => null),
          apiGet<TechDebt>('/tech-debt', { repo_path: activeRepository }).catch(() => null),
          apiGet<DependencyRisk>('/dependency-risk', { repo_path: activeRepository }).catch(() => null),
        ]);

        if (isMounted) {
          if (hs) setHealthScore(hs);
          if (td) setTechDebt(td);
          if (dr) setDepRisk(dr);
        }
      } catch (err: any) {
        if (isMounted) {
          setHealthError(err.message || 'Failed to calculate health metrics.');
        }
      } finally {
        if (isMounted) setHealthLoading(false);
      }
    };

    fetchHealthData();
    return () => {
      isMounted = false;
    };
  }, [activeRepository, scanStatus]);

  const handleScanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputPath.trim()) {
      scanRepo(inputPath.trim());
    }
  };

  // ─────────────────────────────────────────────────────────────
  // 1. EMPTY / ONBOARDING STATE
  // ─────────────────────────────────────────────────────────────
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
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
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
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
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

  // ─────────────────────────────────────────────────────────────
  // 2. ACTIVE REPOSITORY DASHBOARD VIEW
  // ─────────────────────────────────────────────────────────────
  const repoBasename = getRepoBasename(activeRepository);
  const totalFiles = repositoryInfo?.total_files || 0;
  const totalLines = repositoryInfo?.total_lines || 0;
  const lastScanned = formatLastScanned(repositoryInfo?.scanned_at);
  const languages = repositoryInfo?.languages || {};

  // Sort languages by file count
  const sortedLanguages = Object.entries(languages).sort((a, b) => b[1] - a[1]);

  // Overall health presentation
  const overallScore = healthScore?.total_score ?? 80;
  const healthGrade = healthScore?.grade ?? 'Good';
  const getHealthTone = (score: number) => {
    if (score >= 80) return { color: colors.status.success, badge: 'green' as const, label: 'Good' };
    if (score >= 60) return { color: colors.status.warning, badge: 'yellow' as const, label: 'Fair' };
    return { color: colors.status.danger, badge: 'red' as const, label: 'Needs Attention' };
  };
  const healthTone = getHealthTone(overallScore);

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
    <div
      className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 flex flex-col gap-6"
      style={{ backgroundColor: colors.bg.primary }}
    >
      {/* ── 1. HEADER SECTION ── */}
      <header
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          paddingBottom: '16px',
          borderBottom: `1px solid ${colors.border.default}`,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          {/* Repository Identity & Context */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: radius.md,
                  backgroundColor: colors.bg.surfaceSecondary,
                  border: `1px solid ${colors.border.default}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: colors.accent.blue,
                }}
              >
                <Folder size={18} />
              </div>

              <div>
                <h1
                  style={{
                    fontSize: font.size.xl,
                    fontWeight: font.weight.bold,
                    color: colors.text.primary,
                    fontFamily: font.sans,
                    lineHeight: '1.2',
                  }}
                >
                  {repoBasename}
                </h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                  <FilePath path={activeRepository} style={{ maxWidth: '380px' }} />
                  <span style={{ color: colors.text.muted, fontSize: '12px' }}>•</span>
                  <span
                    style={{
                      fontSize: font.size.xs,
                      color: colors.text.muted,
                      fontFamily: font.sans,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <Clock size={11} />
                    Scanned {lastScanned}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Primary Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Button
              variant={showWalkthrough ? 'primary' : 'secondary'}
              size="md"
              icon={<Compass size={14} />}
              onClick={handleToggleWalkthrough}
            >
              {showWalkthrough ? 'Close Guide' : 'Understand Repository'}
            </Button>

            <Button
              variant="secondary"
              size="md"
              icon={<FolderOpen size={14} />}
              onClick={() => setRepoModalOpen(true)}
              disabled={isScanning}
              title="Open or switch repository"
            >
              Switch Repository
            </Button>

            <Button
              variant="secondary"
              size="md"
              icon={<RefreshCw size={14} className={isScanning ? 'animate-spin' : ''} />}
              onClick={() => scanRepo(activeRepository)}
              disabled={isScanning}
              loading={isScanning}
            >
              Rescan
            </Button>

            <Button
              variant="secondary"
              size="md"
              icon={<FolderTree size={14} />}
              onClick={() => navigate('/explorer')}
            >
              Open Explorer
            </Button>

            <Button
              variant="primary"
              size="md"
              icon={<MessageSquare size={14} />}
              onClick={() => navigate('/chat')}
            >
              Ask Assistant
            </Button>
          </div>
        </div>
      </header>

      {/* ── 1.5 REPOSITORY ONBOARDING WALKTHROUGH (Feature 4) ── */}
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
                    <span style={{ fontSize: '11px', fontWeight: 600, color: colors.text.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
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
                    <span style={{ fontSize: '11px', fontWeight: 600, color: colors.text.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
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
                    <span style={{ fontSize: '11px', fontWeight: 600, color: colors.text.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
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
                    <span style={{ fontSize: '11px', fontWeight: 600, color: colors.text.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
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
                    <span style={{ fontSize: '11px', fontWeight: 600, color: colors.text.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
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
                    <span style={{ fontSize: '11px', fontWeight: 600, color: colors.text.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
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
                    <span style={{ fontSize: '11px', fontWeight: 600, color: colors.text.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
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
                    <span style={{ fontSize: '11px', fontWeight: 600, color: colors.text.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
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

      {/* ── 2. REPOSITORY SUMMARY METRICS ── */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <SectionHeader
          label="Repository Summary"
          description="Size, code volume, and primary technologies detected."
        />

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '12px',
          }}
        >
          {/* Files Metric */}
          <Panel padding="14px">
            <span
              style={{
                fontSize: font.size.xs,
                fontWeight: font.weight.semibold,
                color: colors.text.muted,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Source Files
            </span>
            <div
              style={{
                fontSize: font.size['2xl'],
                fontWeight: font.weight.bold,
                color: colors.text.primary,
                fontFamily: font.mono,
                marginTop: '4px',
              }}
            >
              {totalFiles.toLocaleString()}
            </div>
            <span style={{ fontSize: font.size.xs, color: colors.text.secondary, marginTop: '2px' }}>
              Indexed in workspace tree
            </span>
          </Panel>

          {/* Lines Metric */}
          <Panel padding="14px">
            <span
              style={{
                fontSize: font.size.xs,
                fontWeight: font.weight.semibold,
                color: colors.text.muted,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Total Lines
            </span>
            <div
              style={{
                fontSize: font.size['2xl'],
                fontWeight: font.weight.bold,
                color: colors.text.primary,
                fontFamily: font.mono,
                marginTop: '4px',
              }}
            >
              {totalLines.toLocaleString()}
            </div>
            <span style={{ fontSize: font.size.xs, color: colors.text.secondary, marginTop: '2px' }}>
              Lines of code parsed
            </span>
          </Panel>

          {/* Languages Distribution */}
          <Panel padding="14px">
            <span
              style={{
                fontSize: font.size.xs,
                fontWeight: font.weight.semibold,
                color: colors.text.muted,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Primary Languages
            </span>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '6px',
                marginTop: '8px',
              }}
            >
              {sortedLanguages.length > 0 ? (
                sortedLanguages.slice(0, 4).map(([lang, count]) => (
                  <Badge key={lang} variant="default">
                    {lang}: {count}
                  </Badge>
                ))
              ) : (
                <span style={{ fontSize: font.size.xs, color: colors.text.muted }}>None detected</span>
              )}
            </div>
          </Panel>

          {/* Scan Status Metric */}
          <Panel padding="14px">
            <span
              style={{
                fontSize: font.size.xs,
                fontWeight: font.weight.semibold,
                color: colors.text.muted,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Index Status
            </span>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginTop: '6px',
              }}
            >
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: scanStatus === 'indexed' ? colors.status.success : colors.accent.blue,
                }}
              />
              <span
                style={{
                  fontSize: font.size.lg,
                  fontWeight: font.weight.semibold,
                  color: colors.text.primary,
                }}
              >
                {scanStatus === 'indexed' ? 'Indexed & Ready' : isScanning ? 'Indexing...' : 'Idle'}
              </span>
            </div>
            <span style={{ fontSize: font.size.xs, color: colors.text.secondary, marginTop: '2px' }}>
              AST & vector embeddings synchronized
            </span>
          </Panel>
        </div>
      </section>

      {/* ── 3. HEALTH & ARCHITECTURE SUMMARY ── */}
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
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
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
                ? (typeof dim.deductions[0] === 'string' ? dim.deductions[0] : (dim.deductions[0] as any).reason)
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

      {/* ── 4. ATTENTION & QUICK ACTIONS GRID ── */}
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
  );
};
