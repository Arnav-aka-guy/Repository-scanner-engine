import React, { useEffect, useState } from 'react';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { apiGet } from '../services/api';
import { ErrorCard } from '../components/ErrorCard';
import { colors, font, radius } from '../design-system/tokens';
import {
  Cpu,
  FolderRoot,
  Palette,
  Database,
  Sliders,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Zap,
  Clock,
  Trash2,
  FolderOpen,
  ShieldCheck,
  Cloud,
  HardDrive,
  Info,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';

interface ProviderInfo {
  name: string;
  model: string;
  active: boolean;
}

type SettingsTab = 'providers' | 'workspace' | 'appearance' | 'data' | 'advanced';

export const Settings: React.FC = () => {
  const activeTabDefault: SettingsTab = 'providers';
  const [activeTab, setActiveTab] = useState<SettingsTab>(activeTabDefault);

  const activeRepository = useWorkspaceStore((s) => s.activeRepository);
  const recentRepos = useWorkspaceStore((s) => s.recentRepositories);
  const clearWorkspace = useWorkspaceStore((s) => s.clearWorkspace);
  const scanRepo = useWorkspaceStore((s) => s.scanRepo);
  const repositoryInfo = useWorkspaceStore((s) => s.repositoryInfo);

  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [activeProvider, setActiveProvider] = useState<string>('');
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [providersError, setProvidersError] = useState<string | null>(null);

  const [healthStatus, setHealthStatus] = useState<'idle' | 'checking' | 'ok' | 'error'>('idle');
  const [healthMessage, setHealthMessage] = useState('');
  const [healthErrorDetail, setHealthErrorDetail] = useState('');

  // Appearance state
  const [fontFamily, setFontFamily] = useState<'jetbrains' | 'fira' | 'system'>('jetbrains');
  const [compactDensity, setCompactDensity] = useState(false);

  // Advanced config state
  const [contextBudget, setContextBudget] = useState('Auto (12k Groq / 32k Local)');
  const [rateLimit, setRateLimit] = useState('Standard (60 req/min)');

  // Fetch providers on mount
  const fetchProviders = async () => {
    setLoadingProviders(true);
    setProvidersError(null);
    try {
      const res = await apiGet<{ providers: ProviderInfo[]; active_provider: string }>(
        '/settings/providers'
      );
      setProviders(res.providers || []);
      setActiveProvider(res.active_provider || '');
    } catch (err: any) {
      console.error('Failed to load providers:', err);
      setProvidersError(err.message || 'Unable to communicate with the analysis server.');
    } finally {
      setLoadingProviders(false);
    }
  };

  useEffect(() => {
    fetchProviders();
  }, []);

  const handleHealthCheck = async () => {
    setHealthStatus('checking');
    setHealthErrorDetail('');
    try {
      const res = await apiGet<{ status: string; provider: string; message: string }>(
        '/settings/ai-health'
      );
      if (res.status === 'ok') {
        setHealthStatus('ok');
        setHealthMessage(res.message);
      } else {
        setHealthStatus('error');
        setHealthMessage('AI provider test failed.');
        setHealthErrorDetail(res.message);
      }
    } catch (err: any) {
      setHealthStatus('error');
      setHealthMessage('Backend or provider connection refused.');
      setHealthErrorDetail(err.message || 'The application cannot communicate with the analysis server.');
    }
  };

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode; desc: string }[] = [
    { id: 'providers', label: 'AI Providers', icon: <Cpu size={14} />, desc: 'Local and cloud models' },
    { id: 'workspace', label: 'Workspace', icon: <FolderRoot size={14} />, desc: 'Repository & cache' },
    { id: 'appearance', label: 'Appearance', icon: <Palette size={14} />, desc: 'Theme & typography' },
    { id: 'data', label: 'Data', icon: <Database size={14} />, desc: 'Indices & storage' },
    { id: 'advanced', label: 'Advanced', icon: <Sliders size={14} />, desc: 'Budgets & limits' },
  ];

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: colors.bg.primary,
        overflow: 'hidden',
        color: colors.text.primary,
        fontFamily: font.sans,
      }}
    >
      {/* ── Page Header ── */}
      <div
        style={{
          padding: '16px 24px',
          borderBottom: `1px solid ${colors.border.default}`,
          backgroundColor: colors.bg.surface,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div>
          <h1 style={{ fontSize: font.size.lg, fontWeight: font.weight.semibold, margin: 0 }}>
            System Settings
          </h1>
          <p style={{ fontSize: font.size.xs, color: colors.text.muted, margin: '2px 0 0 0' }}>
            Configure repository scanning, AI providers, and local workspace data
          </p>
        </div>

        {/* Global Connection status indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              backgroundColor: colors.bg.surfaceSecondary,
              borderRadius: radius.md,
              border: `1px solid ${colors.border.default}`,
              fontSize: font.size.xs,
              color: colors.text.secondary,
              fontFamily: font.mono,
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: providersError ? colors.status.danger : colors.status.success,
              }}
            />
            {providersError ? 'Backend Disconnected' : 'Backend Connected'}
          </span>
        </div>
      </div>

      {/* ── Main Layout: Sidebar Tabs + Content Panel ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Settings Navigation Tabs */}
        <div
          style={{
            width: '210px',
            minWidth: '210px',
            backgroundColor: colors.bg.surface,
            borderRight: `1px solid ${colors.border.default}`,
            padding: '16px 8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
          }}
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '9px 12px',
                  borderRadius: radius.md,
                  border: 'none',
                  backgroundColor: isActive ? colors.accent.blueSubtle : 'transparent',
                  color: isActive ? colors.accent.blue : colors.text.secondary,
                  fontSize: font.size.sm,
                  fontWeight: isActive ? font.weight.semibold : font.weight.normal,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background-color 0.12s ease, color 0.12s ease',
                  fontFamily: font.sans,
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.backgroundColor = colors.bg.surfaceSecondary;
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <span style={{ color: isActive ? colors.accent.blue : colors.text.muted }}>
                  {tab.icon}
                </span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Content Panel */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '24px 32px',
            maxWidth: '900px',
          }}
        >
          {/* ═════════════════════════════════════════════════════════════ */}
          {/* 1. AI PROVIDERS SECTION                                     */}
          {/* ═════════════════════════════════════════════════════════════ */}
          {activeTab === 'providers' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h2 style={{ fontSize: font.size.base, fontWeight: font.weight.semibold, margin: 0 }}>
                  AI Providers & Models
                </h2>
                <p style={{ fontSize: font.size.xs, color: colors.text.muted, margin: '3px 0 0 0' }}>
                  Manage inference engines for repository-aware chat, semantic explanations, and architecture health
                </p>
              </div>

              {/* Error banner if backend could not list providers */}
              {providersError && (
                <ErrorCard
                  title="Backend Unavailable"
                  whatHappened="The application cannot currently communicate with the analysis server."
                  why="The backend FastAPI server may be offline, stopped, or unreachable on port 8000."
                  whatCanIDo={[
                    'Verify the backend server is running: `uvicorn backend.main:app --port 8000`',
                    'Check whether firewall or antivirus software is blocking localhost connections.',
                    'Click Retry to test the server connection again.',
                  ]}
                  onRetry={fetchProviders}
                  retrying={loadingProviders}
                />
              )}

              {/* Health Check Bar */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  backgroundColor: colors.bg.surface,
                  border: `1px solid ${colors.border.default}`,
                  borderRadius: radius.lg,
                }}
              >
                <div>
                  <div style={{ fontSize: font.size.sm, fontWeight: font.weight.medium, color: colors.text.primary }}>
                    Active Provider Test
                  </div>
                  <div style={{ fontSize: font.size.xs, color: colors.text.muted }}>
                    Sends a ping prompt to verify inference latency and API key validity
                  </div>
                </div>

                <button
                  onClick={handleHealthCheck}
                  disabled={healthStatus === 'checking'}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 14px',
                    backgroundColor: colors.bg.surfaceSecondary,
                    border: `1px solid ${colors.border.default}`,
                    borderRadius: radius.md,
                    fontSize: font.size.xs,
                    fontWeight: font.weight.medium,
                    color: colors.text.primary,
                    cursor: healthStatus === 'checking' ? 'not-allowed' : 'pointer',
                    fontFamily: font.sans,
                  }}
                >
                  {healthStatus === 'checking' ? (
                    <>
                      <Loader2 size={13} style={{ animation: 'ds-spin 1s linear infinite' }} />
                      <span>Testing...</span>
                    </>
                  ) : (
                    <>
                      <Zap size={13} style={{ color: colors.accent.blue }} />
                      <span>Test Connection</span>
                    </>
                  )}
                </button>
              </div>

              {/* Health check results */}
              {healthStatus === 'ok' && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 14px',
                    backgroundColor: colors.status.successSubtle,
                    border: `1px solid ${colors.status.successBorder}`,
                    borderRadius: radius.md,
                    fontSize: font.size.xs,
                    color: colors.status.success,
                  }}
                >
                  <CheckCircle2 size={15} />
                  <span>{healthMessage}</span>
                </div>
              )}

              {healthStatus === 'error' && (
                <ErrorCard
                  title="Inference Connection Failed"
                  whatHappened={healthMessage}
                  why={healthErrorDetail || 'The provider timed out or returned an authentication/network error.'}
                  whatCanIDo={[
                    'If using Ollama: ensure Ollama is running (`ollama serve`) and the model is downloaded (`ollama pull llama3`).',
                    'If using Groq or OpenAI: ensure your API key in `.env` is valid and has remaining token quota.',
                    'Check the backend logs for detailed stack traces.',
                  ]}
                  onRetry={handleHealthCheck}
                />
              )}

              {/* Configured Providers List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <span
                  style={{
                    fontSize: font.size.xs,
                    fontWeight: font.weight.semibold,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: colors.text.muted,
                  }}
                >
                  Configured Providers
                </span>

                {loadingProviders ? (
                  <div
                    style={{
                      padding: '24px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      color: colors.text.muted,
                      fontSize: font.size.xs,
                    }}
                  >
                    <Loader2 size={16} style={{ animation: 'ds-spin 1s linear infinite' }} />
                    <span>Detecting available AI providers...</span>
                  </div>
                ) : providers.length > 0 ? (
                  providers.map((p) => {
                    const isLocal = p.name.toLowerCase().includes('ollama');
                    return (
                      <div
                        key={p.name}
                        style={{
                          backgroundColor: colors.bg.surface,
                          border: `1px solid ${p.active ? colors.accent.blue : colors.border.default}`,
                          borderRadius: radius.lg,
                          padding: '16px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div
                              style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: radius.md,
                                backgroundColor: isLocal ? colors.status.successSubtle : colors.accent.blueSubtle,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: isLocal ? colors.status.success : colors.accent.blue,
                              }}
                            >
                              {isLocal ? <HardDrive size={16} /> : <Cloud size={16} />}
                            </div>

                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span
                                  style={{
                                    fontSize: font.size.sm,
                                    fontWeight: font.weight.semibold,
                                    textTransform: 'capitalize',
                                  }}
                                >
                                  {p.name}
                                </span>
                                <span
                                  style={{
                                    fontSize: font.size.xs,
                                    padding: '1px 6px',
                                    borderRadius: radius.sm,
                                    backgroundColor: colors.bg.elevated,
                                    color: colors.text.muted,
                                    border: `1px solid ${colors.border.subtle}`,
                                  }}
                                >
                                  {isLocal ? 'Local AI' : 'Cloud AI'}
                                </span>
                                {p.active && (
                                  <span
                                    style={{
                                      fontSize: '10px',
                                      padding: '1px 6px',
                                      borderRadius: radius.sm,
                                      backgroundColor: colors.status.successSubtle,
                                      border: `1px solid ${colors.status.successBorder}`,
                                      color: colors.status.success,
                                      fontWeight: font.weight.semibold,
                                    }}
                                  >
                                    ACTIVE
                                  </span>
                                )}
                              </div>
                              <span
                                style={{
                                  fontSize: font.size.xs,
                                  color: colors.text.muted,
                                  fontFamily: font.mono,
                                }}
                              >
                                Model: {p.model}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Plain English Privacy & Data Policy Note */}
                        <div
                          style={{
                            fontSize: font.size.xs,
                            color: colors.text.secondary,
                            backgroundColor: colors.bg.primary,
                            padding: '8px 12px',
                            borderRadius: radius.md,
                            border: `1px solid ${colors.border.subtle}`,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                          }}
                        >
                          <ShieldCheck size={14} style={{ color: isLocal ? colors.status.success : colors.accent.blue, flexShrink: 0 }} />
                          <span>
                            {isLocal
                              ? 'Privacy guarantee: Runs 100% on your computer. Repository code never leaves your local machine.'
                              : 'Cloud inference: Requires an API key and sends retrieved codebase context snippets to the selected provider. Secrets are never logged.'}
                          </span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div
                    style={{
                      padding: '16px',
                      backgroundColor: colors.bg.surface,
                      borderRadius: radius.lg,
                      border: `1px solid ${colors.border.default}`,
                      fontSize: font.size.xs,
                      color: colors.text.muted,
                    }}
                  >
                    No active providers detected. Local Ollama fallback will be used if installed.
                  </div>
                )}
              </div>

              {/* Provider setup instructions */}
              <div
                style={{
                  backgroundColor: colors.bg.surface,
                  border: `1px solid ${colors.border.default}`,
                  borderRadius: radius.lg,
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Info size={14} style={{ color: colors.accent.blue }} />
                  <span style={{ fontSize: font.size.sm, fontWeight: font.weight.medium }}>
                    How to configure providers
                  </span>
                </div>
                <p style={{ fontSize: font.size.xs, color: colors.text.secondary, margin: 0, lineHeight: 1.5 }}>
                  Add your API credentials to the root <code style={{ color: colors.accent.blue, fontFamily: font.mono }}>.env</code> file. Antigravity Engine automatically establishes a fallback chain from Groq to OpenAI, OpenRouter, and local Ollama:
                </p>
                <pre
                  style={{
                    backgroundColor: colors.bg.primary,
                    border: `1px solid ${colors.border.subtle}`,
                    borderRadius: radius.md,
                    padding: '10px 12px',
                    fontSize: font.size.xs,
                    fontFamily: font.mono,
                    color: colors.text.secondary,
                    margin: 0,
                    overflowX: 'auto',
                  }}
                >
                  {`# Preferred cloud (Fast & Free tier available)\nGROQ_API_KEY=gsk_your_key_here\n\n# OpenAI or OpenRouter\nOPENAI_API_KEY=sk-your_key_here\nOPENROUTER_API_KEY=sk-or-your_key_here\n\n# Local Ollama fallback (requires no keys)\nLLM_BASE_URL=http://localhost:11434`}
                </pre>
              </div>
            </div>
          )}

          {/* ═════════════════════════════════════════════════════════════ */}
          {/* 2. WORKSPACE SECTION                                         */}
          {/* ═════════════════════════════════════════════════════════════ */}
          {activeTab === 'workspace' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h2 style={{ fontSize: font.size.base, fontWeight: font.weight.semibold, margin: 0 }}>
                  Workspace & Repositories
                </h2>
                <p style={{ fontSize: font.size.xs, color: colors.text.muted, margin: '3px 0 0 0' }}>
                  Manage active repository context, scan history, and cache
                </p>
              </div>

              {/* Active repository status */}
              <div
                style={{
                  backgroundColor: colors.bg.surface,
                  border: `1px solid ${colors.border.default}`,
                  borderRadius: radius.lg,
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <span
                  style={{
                    fontSize: font.size.xs,
                    fontWeight: font.weight.semibold,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: colors.text.muted,
                  }}
                >
                  Active Repository
                </span>
                {activeRepository ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                    <div>
                      <div
                        style={{
                          fontSize: font.size.sm,
                          fontFamily: font.mono,
                          color: colors.text.primary,
                        }}
                      >
                        {activeRepository}
                      </div>
                      <div style={{ fontSize: font.size.xs, color: colors.text.muted, marginTop: '2px' }}>
                        {repositoryInfo?.total_files || 0} files &bull; {repositoryInfo?.total_lines || 0} lines scanned
                      </div>
                    </div>

                    <button
                      onClick={() => scanRepo(activeRepository)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 12px',
                        backgroundColor: colors.bg.surfaceSecondary,
                        border: `1px solid ${colors.border.default}`,
                        borderRadius: radius.md,
                        fontSize: font.size.xs,
                        fontWeight: font.weight.medium,
                        color: colors.text.primary,
                        cursor: 'pointer',
                        fontFamily: font.sans,
                      }}
                    >
                      <RefreshCw size={12} />
                      <span>Rescan</span>
                    </button>
                  </div>
                ) : (
                  <div style={{ fontSize: font.size.xs, color: colors.text.muted, fontStyle: 'italic' }}>
                    No repository currently active. Open or scan a folder in the Explorer.
                  </div>
                )}
              </div>

              {/* Recent Repositories */}
              <div
                style={{
                  backgroundColor: colors.bg.surface,
                  border: `1px solid ${colors.border.default}`,
                  borderRadius: radius.lg,
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Clock size={15} style={{ color: colors.accent.blue }} />
                  <span style={{ fontSize: font.size.sm, fontWeight: font.weight.medium }}>
                    Recent Repositories
                  </span>
                </div>

                {recentRepos.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {recentRepos.map((repo) => (
                      <button
                        key={repo}
                        onClick={() => scanRepo(repo)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '10px 12px',
                          backgroundColor: colors.bg.primary,
                          border: `1px solid ${colors.border.default}`,
                          borderRadius: radius.md,
                          textAlign: 'left',
                          cursor: 'pointer',
                          color: colors.text.secondary,
                          transition: 'border-color 0.12s ease',
                          fontFamily: font.sans,
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = colors.accent.blue;
                          e.currentTarget.style.color = colors.text.primary;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = colors.border.default;
                          e.currentTarget.style.color = colors.text.secondary;
                        }}
                      >
                        <FolderOpen size={14} style={{ color: colors.accent.blue, flexShrink: 0 }} />
                        <span style={{ fontSize: font.size.xs, fontFamily: font.mono, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {repo}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: font.size.xs, color: colors.text.muted, fontStyle: 'italic' }}>
                    No recent repositories. Scanned projects will be saved here for quick switching.
                  </div>
                )}
              </div>

              {/* Clear workspace state */}
              <div
                style={{
                  backgroundColor: colors.bg.surface,
                  border: `1px solid ${colors.status.dangerBorder}`,
                  borderRadius: radius.lg,
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <div>
                  <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.status.danger }}>
                    Reset Workspace
                  </div>
                  <div style={{ fontSize: font.size.xs, color: colors.text.muted, marginTop: '2px' }}>
                    Clears active repository results, AST trees, dependency caches, and in-memory chat state.
                  </div>
                </div>

                <button
                  onClick={() => {
                    if (confirm('Are you sure you want to clear all workspace state?')) {
                      clearWorkspace();
                    }
                  }}
                  style={{
                    alignSelf: 'flex-start',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 14px',
                    backgroundColor: colors.status.dangerSubtle,
                    border: `1px solid ${colors.status.dangerBorder}`,
                    borderRadius: radius.md,
                    fontSize: font.size.xs,
                    fontWeight: font.weight.medium,
                    color: colors.status.danger,
                    cursor: 'pointer',
                    fontFamily: font.sans,
                  }}
                >
                  <Trash2 size={13} />
                  <span>Clear Workspace Data</span>
                </button>
              </div>
            </div>
          )}

          {/* ═════════════════════════════════════════════════════════════ */}
          {/* 3. APPEARANCE SECTION                                        */}
          {/* ═════════════════════════════════════════════════════════════ */}
          {activeTab === 'appearance' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h2 style={{ fontSize: font.size.base, fontWeight: font.weight.semibold, margin: 0 }}>
                  Appearance & Display
                </h2>
                <p style={{ fontSize: font.size.xs, color: colors.text.muted, margin: '3px 0 0 0' }}>
                  Professional developer-tool dark theme customization
                </p>
              </div>

              {/* Theme status */}
              <div
                style={{
                  backgroundColor: colors.bg.surface,
                  border: `1px solid ${colors.border.default}`,
                  borderRadius: radius.lg,
                  padding: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontSize: font.size.sm, fontWeight: font.weight.medium }}>Theme Mode</div>
                  <div style={{ fontSize: font.size.xs, color: colors.text.muted }}>
                    Restrained IDE Dark Theme (#0F1115 canvas, #151922 panels, #292F38 borders)
                  </div>
                </div>
                <span
                  style={{
                    fontSize: font.size.xs,
                    padding: '3px 8px',
                    borderRadius: radius.sm,
                    backgroundColor: colors.bg.surfaceSecondary,
                    border: `1px solid ${colors.border.default}`,
                    color: colors.text.secondary,
                    fontFamily: font.mono,
                  }}
                >
                  IDE Dark (Default)
                </span>
              </div>

              {/* Code Monospace Font Selection */}
              <div
                style={{
                  backgroundColor: colors.bg.surface,
                  border: `1px solid ${colors.border.default}`,
                  borderRadius: radius.lg,
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div>
                  <div style={{ fontSize: font.size.sm, fontWeight: font.weight.medium }}>Code Font Family</div>
                  <div style={{ fontSize: font.size.xs, color: colors.text.muted }}>
                    Monospace font used in the Code Viewer, AST symbols, and terminal panes
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                  {[
                    { id: 'jetbrains', label: 'JetBrains Mono', preview: 'const x = () => 42;' },
                    { id: 'fira', label: 'Fira Code', preview: 'const x = () => 42;' },
                    { id: 'system', label: 'System Monospace', preview: 'const x = () => 42;' },
                  ].map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setFontFamily(f.id as any)}
                      style={{
                        padding: '12px',
                        backgroundColor: fontFamily === f.id ? colors.accent.blueSubtle : colors.bg.primary,
                        border: `1px solid ${fontFamily === f.id ? colors.accent.blue : colors.border.default}`,
                        borderRadius: radius.md,
                        textAlign: 'left',
                        cursor: 'pointer',
                        color: colors.text.primary,
                        fontFamily: font.sans,
                      }}
                    >
                      <div style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold }}>{f.label}</div>
                      <div
                        style={{
                          fontSize: '11px',
                          color: colors.text.muted,
                          fontFamily: font.mono,
                          marginTop: '4px',
                        }}
                      >
                        {f.preview}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Density toggle */}
              <div
                style={{
                  backgroundColor: colors.bg.surface,
                  border: `1px solid ${colors.border.default}`,
                  borderRadius: radius.lg,
                  padding: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontSize: font.size.sm, fontWeight: font.weight.medium }}>Compact Density</div>
                  <div style={{ fontSize: font.size.xs, color: colors.text.muted }}>
                    Reduce padding in file trees and architecture cards for smaller screens
                  </div>
                </div>

                <input
                  type="checkbox"
                  checked={compactDensity}
                  onChange={(e) => setCompactDensity(e.target.checked)}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
              </div>
            </div>
          )}

          {/* ═════════════════════════════════════════════════════════════ */}
          {/* 4. DATA SECTION                                              */}
          {/* ═════════════════════════════════════════════════════════════ */}
          {activeTab === 'data' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h2 style={{ fontSize: font.size.base, fontWeight: font.weight.semibold, margin: 0 }}>
                  Storage & Data Management
                </h2>
                <p style={{ fontSize: font.size.xs, color: colors.text.muted, margin: '3px 0 0 0' }}>
                  Persistent disk locations for scan jobs, chat logs, and vector embeddings
                </p>
              </div>

              {/* Data Directories Information */}
              <div
                style={{
                  backgroundColor: colors.bg.surface,
                  border: `1px solid ${colors.border.default}`,
                  borderRadius: radius.lg,
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <span
                  style={{
                    fontSize: font.size.xs,
                    fontWeight: font.weight.semibold,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: colors.text.muted,
                  }}
                >
                  Local Storage Paths
                </span>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {[
                    { label: 'Scan Jobs Registry', path: 'data/scan_jobs.json', desc: 'Async scan progress & job history' },
                    { label: 'Conversations Store', path: 'data/chat_conversations.json', desc: 'AI assistant history & repo sessions' },
                    { label: 'Graph Visualizations', path: 'data/graphs/', desc: 'Dependency and call graphs' },
                    { label: 'Semantic Embeddings', path: 'data/embeddings/', desc: 'FAISS / Chroma vector indexes' },
                    { label: 'Parser Cache', path: 'data/cache/', desc: 'File hashes & parsed AST symbols' },
                  ].map((row) => (
                    <div
                      key={row.label}
                      style={{
                        padding: '10px 14px',
                        backgroundColor: colors.bg.primary,
                        borderRadius: radius.md,
                        border: `1px solid ${colors.border.subtle}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: font.size.sm, fontWeight: font.weight.medium, color: colors.text.primary }}>
                          {row.label}
                        </div>
                        <div style={{ fontSize: font.size.xs, color: colors.text.muted }}>{row.desc}</div>
                      </div>
                      <code
                        style={{
                          fontSize: font.size.xs,
                          color: colors.accent.blue,
                          fontFamily: font.mono,
                          backgroundColor: colors.bg.surfaceSecondary,
                          padding: '2px 8px',
                          borderRadius: radius.sm,
                        }}
                      >
                        {row.path}
                      </code>
                    </div>
                  ))}
                </div>
              </div>

              {/* Storage Mode Note */}
              <div
                style={{
                  backgroundColor: colors.bg.surface,
                  border: `1px solid ${colors.border.default}`,
                  borderRadius: radius.lg,
                  padding: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <HardDrive size={18} style={{ color: colors.status.success, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: font.size.sm, fontWeight: font.weight.medium }}>File-Backed Local Mode</div>
                  <div style={{ fontSize: font.size.xs, color: colors.text.muted, marginTop: '2px' }}>
                    Zero external dependencies. All indices and chat logs are safely stored in your project directory without requiring PostgreSQL.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═════════════════════════════════════════════════════════════ */}
          {/* 5. ADVANCED SECTION                                          */}
          {/* ═════════════════════════════════════════════════════════════ */}
          {activeTab === 'advanced' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h2 style={{ fontSize: font.size.base, fontWeight: font.weight.semibold, margin: 0 }}>
                  Advanced Configuration
                </h2>
                <p style={{ fontSize: font.size.xs, color: colors.text.muted, margin: '3px 0 0 0' }}>
                  Context token budgets, rate limits, and scan parameters
                </p>
              </div>

              {/* Context Budget */}
              <div
                style={{
                  backgroundColor: colors.bg.surface,
                  border: `1px solid ${colors.border.default}`,
                  borderRadius: radius.lg,
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: font.size.sm, fontWeight: font.weight.medium }}>
                      Context Character Budget
                    </div>
                    <div style={{ fontSize: font.size.xs, color: colors.text.muted }}>
                      Limits the amount of code context fed into LLM prompts to avoid token limits
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: font.size.xs,
                      padding: '2px 8px',
                      borderRadius: radius.sm,
                      backgroundColor: colors.bg.elevated,
                      color: colors.text.primary,
                      fontFamily: font.mono,
                    }}
                  >
                    {contextBudget}
                  </span>
                </div>
              </div>

              {/* Rate Limiting */}
              <div
                style={{
                  backgroundColor: colors.bg.surface,
                  border: `1px solid ${colors.border.default}`,
                  borderRadius: radius.lg,
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: font.size.sm, fontWeight: font.weight.medium }}>API Rate Limiting</div>
                    <div style={{ fontSize: font.size.xs, color: colors.text.muted }}>
                      Protects against runaway recursion and accidental duplicate queries
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: font.size.xs,
                      padding: '2px 8px',
                      borderRadius: radius.sm,
                      backgroundColor: colors.bg.elevated,
                      color: colors.text.primary,
                      fontFamily: font.mono,
                    }}
                  >
                    {rateLimit}
                  </span>
                </div>
              </div>

              {/* Scanning Constraints */}
              <div
                style={{
                  backgroundColor: colors.bg.surface,
                  border: `1px solid ${colors.border.default}`,
                  borderRadius: radius.lg,
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <span
                  style={{
                    fontSize: font.size.xs,
                    fontWeight: font.weight.semibold,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: colors.text.muted,
                  }}
                >
                  Scanner Safety Limits
                </span>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                  <div
                    style={{
                      padding: '10px',
                      backgroundColor: colors.bg.primary,
                      borderRadius: radius.md,
                      border: `1px solid ${colors.border.subtle}`,
                    }}
                  >
                    <div style={{ fontSize: '10px', color: colors.text.muted }}>MAX FILES</div>
                    <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, marginTop: '2px' }}>
                      10,000 files
                    </div>
                  </div>

                  <div
                    style={{
                      padding: '10px',
                      backgroundColor: colors.bg.primary,
                      borderRadius: radius.md,
                      border: `1px solid ${colors.border.subtle}`,
                    }}
                  >
                    <div style={{ fontSize: '10px', color: colors.text.muted }}>MAX FILE SIZE</div>
                    <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, marginTop: '2px' }}>
                      5 MB per file
                    </div>
                  </div>

                  <div
                    style={{
                      padding: '10px',
                      backgroundColor: colors.bg.primary,
                      borderRadius: radius.md,
                      border: `1px solid ${colors.border.subtle}`,
                    }}
                  >
                    <div style={{ fontSize: '10px', color: colors.text.muted }}>MAX DIR DEPTH</div>
                    <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, marginTop: '2px' }}>
                      30 levels
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
