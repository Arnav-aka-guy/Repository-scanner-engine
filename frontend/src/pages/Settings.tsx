import React, { useEffect, useState } from 'react';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { apiGet } from '../services/api';
import {
  Settings as SettingsIcon,
  Cpu,
  Check,
  AlertTriangle,
  Loader2,
  Zap,
  Clock,
  Trash2,
  FolderOpen,
} from 'lucide-react';

interface ProviderInfo {
  name: string;
  model: string;
  active: boolean;
}

export const Settings: React.FC = () => {
  const recentRepos = useWorkspaceStore((s) => s.recentRepositories);
  const clearWorkspace = useWorkspaceStore((s) => s.clearWorkspace);
  const scanRepo = useWorkspaceStore((s) => s.scanRepo);

  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [activeProvider, setActiveProvider] = useState<string>('');
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [healthStatus, setHealthStatus] = useState<'idle' | 'checking' | 'ok' | 'error'>('idle');
  const [healthMessage, setHealthMessage] = useState('');

  // Fetch providers on mount
  useEffect(() => {
    const fetchProviders = async () => {
      try {
        const res = await apiGet<{ providers: ProviderInfo[]; active_provider: string }>(
          '/settings/providers'
        );
        setProviders(res.providers);
        setActiveProvider(res.active_provider);
      } catch (err: any) {
        console.error('Failed to load providers:', err);
      } finally {
        setLoadingProviders(false);
      }
    };
    fetchProviders();
  }, []);

  const handleHealthCheck = async () => {
    setHealthStatus('checking');
    try {
      const res = await apiGet<{ status: string; provider: string; message: string }>(
        '/settings/ai-health'
      );
      setHealthStatus(res.status === 'ok' ? 'ok' : 'error');
      setHealthMessage(res.message);
    } catch (err: any) {
      setHealthStatus('error');
      setHealthMessage(err.message || 'Health check failed');
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-8 scrollbar-thin">
      <div className="max-w-2xl mx-auto flex flex-col gap-8">
        {/* Page Header */}
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{
              backgroundColor: 'rgba(96, 165, 250, 0.08)',
              border: '1px solid rgba(96, 165, 250, 0.2)',
              color: 'var(--accent-primary)',
            }}
          >
            <SettingsIcon size={20} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[var(--text-primary)]">Settings</h1>
            <p className="text-xs text-[var(--text-muted)]">Configure AI providers and manage workspaces</p>
          </div>
        </div>

        {/* ── AI Providers Section ── */}
        <div
          className="rounded-xl border p-6 flex flex-col gap-5"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            borderColor: 'var(--border-color)',
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cpu size={16} className="text-[var(--accent-purple)]" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-primary)]">
                AI Providers
              </h2>
            </div>
            <button
              onClick={handleHealthCheck}
              disabled={healthStatus === 'checking'}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{
                backgroundColor: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
              }}
            >
              {healthStatus === 'checking' ? (
                <>
                  <Loader2 size={12} className="animate-spin" />
                  <span>Testing...</span>
                </>
              ) : (
                <>
                  <Zap size={12} />
                  <span>Test Connection</span>
                </>
              )}
            </button>
          </div>

          {/* Health status */}
          {healthStatus === 'ok' && (
            <div className="p-3 rounded-lg flex items-center gap-2 text-xs"
              style={{ backgroundColor: 'rgba(166, 227, 161, 0.05)', border: '1px solid rgba(166, 227, 161, 0.2)', color: 'var(--accent-green)' }}
            >
              <Check size={14} />
              <span className="font-semibold">{healthMessage}</span>
            </div>
          )}
          {healthStatus === 'error' && (
            <div className="p-3 rounded-lg flex items-center gap-2 text-xs"
              style={{ backgroundColor: 'rgba(251, 113, 133, 0.05)', border: '1px solid rgba(251, 113, 133, 0.2)', color: 'var(--accent-rose)' }}
            >
              <AlertTriangle size={14} />
              <span className="font-semibold">{healthMessage}</span>
            </div>
          )}

          {/* Provider list */}
          {loadingProviders ? (
            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
              <Loader2 size={14} className="animate-spin" />
              <span>Loading providers...</span>
            </div>
          ) : providers.length > 0 ? (
            <div className="flex flex-col gap-3">
              {providers.map((p) => (
                <div
                  key={p.name}
                  className="flex items-center justify-between p-4 rounded-xl border transition-all"
                  style={{
                    backgroundColor: p.active ? 'rgba(96, 165, 250, 0.04)' : 'var(--bg-primary)',
                    borderColor: p.active ? 'rgba(96, 165, 250, 0.2)' : 'var(--border-color)',
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{
                        backgroundColor: p.active ? 'var(--accent-green)' : 'var(--text-muted)',
                        boxShadow: p.active ? '0 0 8px var(--accent-green)' : 'none',
                      }}
                    />
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-bold font-mono text-[var(--text-primary)] capitalize">
                        {p.name}
                      </span>
                      <span className="text-[10px] text-[var(--text-muted)] font-mono">
                        Model: {p.model}
                      </span>
                    </div>
                  </div>
                  {p.active && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: 'rgba(166, 227, 161, 0.08)',
                        border: '1px solid rgba(166, 227, 161, 0.2)',
                        color: 'var(--accent-green)',
                      }}
                    >
                      ACTIVE
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-[var(--text-muted)] italic">
              No providers configured. Set GROQ_API_KEY, OPENAI_API_KEY, or run Ollama locally.
            </div>
          )}

          {/* Configuration hint */}
          <div className="p-3 rounded-lg text-xs leading-relaxed"
            style={{
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-secondary)',
            }}
          >
            <span className="font-bold text-[var(--text-primary)] block mb-1">How to configure providers:</span>
            Create a <code className="px-1.5 py-0.5 rounded text-[10px] font-mono" style={{ backgroundColor: 'var(--bg-tertiary)' }}>.env</code> file in the project root with:
            <pre className="mt-2 p-2 rounded text-[10px] font-mono" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
{`GROQ_API_KEY=gsk_your_key_here
OPENAI_API_KEY=sk-your_key_here
OPENROUTER_API_KEY=sk-or-your_key_here`}
            </pre>
          </div>
        </div>

        {/* ── Recent Repositories Section ── */}
        <div
          className="rounded-xl border p-6 flex flex-col gap-4"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            borderColor: 'var(--border-color)',
          }}
        >
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-[var(--accent-primary)]" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-primary)]">
              Recent Repositories
            </h2>
          </div>

          {recentRepos.length > 0 ? (
            <div className="flex flex-col gap-2">
              {recentRepos.map((repo) => (
                <button
                  key={repo}
                  onClick={() => scanRepo(repo)}
                  className="flex items-center gap-3 p-3 rounded-lg border text-left transition-all hover:-translate-y-0.5"
                  style={{
                    backgroundColor: 'var(--bg-primary)',
                    borderColor: 'var(--border-color)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--accent-primary)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-color)';
                  }}
                >
                  <FolderOpen size={14} className="text-[var(--accent-primary)] flex-shrink-0" />
                  <span className="text-xs font-mono truncate text-[var(--text-secondary)]">
                    {repo}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-xs text-[var(--text-muted)] italic">
              No repositories scanned yet. Scan a repository from the Explorer view to see it here.
            </div>
          )}
        </div>

        {/* ── Danger Zone ── */}
        <div
          className="rounded-xl border p-6 flex flex-col gap-4"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            borderColor: 'rgba(251, 113, 133, 0.15)',
          }}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-[var(--accent-rose)]" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--accent-rose)]">
              Danger Zone
            </h2>
          </div>

          <button
            onClick={() => {
              if (confirm('Clear all workspace data? This will reset scan results, chat history, and graph data.')) {
                clearWorkspace();
              }
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all w-fit"
            style={{
              backgroundColor: 'rgba(251, 113, 133, 0.08)',
              border: '1px solid rgba(251, 113, 133, 0.2)',
              color: 'var(--accent-rose)',
            }}
          >
            <Trash2 size={14} />
            <span>Clear Workspace Data</span>
          </button>
        </div>
      </div>
    </div>
  );
};
