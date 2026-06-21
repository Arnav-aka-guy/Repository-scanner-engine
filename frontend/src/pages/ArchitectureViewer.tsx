import React, { useEffect, useState } from 'react';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { apiPost } from '../services/api';
import {
  Tv,
  Loader2,
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  Shield,
  Layers,
  GitBranch,
  Code2,
  FileCode,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ArchitectureReport {
  score: number;
  layers: Record<string, string[]>;
  circular_dependencies: string[][];
  dead_code: { id: string; label: string; node_type: string; file_path: string }[];
  violations: { source_file: string; target_file: string; source_layer: string; target_layer: string; description: string }[];
  strengths: string[];
  problems: string[];
  summary: string;
  stats: Record<string, number>;
}

const ScoreGauge: React.FC<{ score: number }> = ({ score }) => {
  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 80 ? 'var(--accent-green)' : score >= 60 ? 'var(--accent-yellow)' : 'var(--accent-rose)';
  const label = score >= 80 ? 'EXCELLENT' : score >= 60 ? 'GOOD' : score >= 40 ? 'FAIR' : 'NEEDS WORK';

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-32 h-32">
        <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
          <circle cx="60" cy="60" r="54" fill="none" stroke="var(--border-color)" strokeWidth="6" />
          <motion.circle
            cx="60" cy="60" r="54" fill="none" stroke={color} strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
            style={{ filter: `drop-shadow(0 0 8px ${color})` }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span
            className="text-3xl font-extrabold font-mono"
            style={{ color }}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3, type: 'spring', stiffness: 300, damping: 20 }}
          >
            {score}
          </motion.span>
          <span className="text-[9px] font-bold tracking-widest uppercase text-[var(--text-muted)]">{label}</span>
        </div>
      </div>
    </div>
  );
};

export const ArchitectureViewer: React.FC = () => {
  const repoPath = useWorkspaceStore((s) => s.activeRepository) || '';
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
      // Expand all layers by default
      setExpandedLayers(new Set(Object.keys(res.layers)));
    } catch (err: any) {
      setError(err.message || 'Architecture analysis failed.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (repoPath) runAnalysis();
  }, [repoPath]);

  const toggleLayer = (name: string) => {
    setExpandedLayers((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden h-full">
      {/* Page Header */}
      <div
        className="px-6 py-4 border-b flex items-center justify-between select-none"
        style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
      >
        <div className="flex items-center gap-2.5">
          <span className="text-[var(--accent-primary)]"><Shield size={20} /></span>
          <h1 className="text-sm font-bold uppercase tracking-wider text-[var(--text-primary)]">
            Architecture Intelligence
          </h1>
        </div>
        <button
          onClick={runAnalysis}
          disabled={loading || !repoPath}
          className="btn-primary !py-2 !px-4 !text-xs"
        >
          <Tv size={12} />
          <span>Analyze Architecture</span>
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-grow overflow-y-auto p-6 scrollbar-thin">
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-5 p-3 rounded-lg flex items-center gap-3 text-xs"
              style={{ backgroundColor: 'rgba(251, 113, 133, 0.05)', border: '1px solid rgba(251, 113, 133, 0.2)', color: 'var(--accent-rose)' }}
            >
              <AlertTriangle size={16} />
              <span>{error}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {loading ? (
          <div className="w-full h-64 flex flex-col items-center justify-center gap-3">
            <Loader2 size={32} className="animate-spin text-[var(--accent-primary)]" />
            <span className="text-sm font-semibold font-mono text-[var(--text-secondary)]">
              Analyzing architecture layers, cycles, and violations ...
            </span>
          </div>
        ) : !repoPath ? (
          <div className="w-full h-64 flex items-center justify-center italic text-sm text-[var(--text-muted)]">
            Scan a repository in the Explorer view to analyze its architecture.
          </div>
        ) : report ? (
          <div className="max-w-5xl mx-auto flex flex-col gap-8">
            {/* ── Score + Stats Row ── */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="grid grid-cols-1 md:grid-cols-3 gap-6"
            >
              {/* Score Gauge */}
              <div className="rounded-xl border p-6 flex items-center justify-center"
                style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
              >
                <ScoreGauge score={report.score} />
              </div>

              {/* Quick Stats */}
              <div className="col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: 'Layers', value: report.stats.total_layers, icon: Layers, color: 'var(--accent-primary)' },
                  { label: 'Cycles', value: report.stats.total_circular_deps, icon: GitBranch, color: report.stats.total_circular_deps > 0 ? 'var(--accent-rose)' : 'var(--accent-green)' },
                  { label: 'Dead Code', value: report.stats.total_dead_code, icon: Code2, color: report.stats.total_dead_code > 5 ? 'var(--accent-yellow)' : 'var(--accent-green)' },
                  { label: 'Violations', value: report.stats.total_violations, icon: AlertCircle, color: report.stats.total_violations > 0 ? 'var(--accent-rose)' : 'var(--accent-green)' },
                ].map(({ label, value, icon: Icon, color }, i) => (
                  <motion.div
                    key={label}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 + i * 0.05, type: 'spring', stiffness: 300, damping: 24 }}
                    className="stat-card flex flex-col gap-1 items-center text-center"
                  >
                    <Icon size={16} style={{ color }} />
                    <span className="text-2xl font-extrabold font-mono" style={{ color }}>{value}</span>
                    <span className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider">{label}</span>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* ── Strengths & Problems ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Strengths */}
              <div className="rounded-xl border p-5 flex flex-col gap-3"
                style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
              >
                <div className="flex items-center gap-2">
                  <CheckCircle size={16} className="text-[var(--accent-green)]" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--accent-green)]">Strengths</h3>
                </div>
                <div className="flex flex-col gap-2">
                  {report.strengths.map((s, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-[var(--text-secondary)] leading-relaxed">
                      <span className="text-[var(--accent-green)] mt-0.5 flex-shrink-0">✓</span>
                      <span>{s}</span>
                    </div>
                  ))}
                  {report.strengths.length === 0 && (
                    <span className="text-xs text-[var(--text-muted)] italic">No strengths identified.</span>
                  )}
                </div>
              </div>

              {/* Problems */}
              <div className="rounded-xl border p-5 flex flex-col gap-3"
                style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle size={16} className="text-[var(--accent-rose)]" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--accent-rose)]">Areas for Improvement</h3>
                </div>
                <div className="flex flex-col gap-2">
                  {report.problems.map((p, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-[var(--text-secondary)] leading-relaxed">
                      <span className="text-[var(--accent-rose)] mt-0.5 flex-shrink-0">✗</span>
                      <span>{p}</span>
                    </div>
                  ))}
                  {report.problems.length === 0 && (
                    <span className="text-xs text-[var(--text-muted)] italic">No issues found. Excellent!</span>
                  )}
                </div>
              </div>
            </div>

            {/* ── Architecture Layers ── */}
            <div className="rounded-xl border p-5 flex flex-col gap-4"
              style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
            >
              <div className="flex items-center gap-2">
                <Layers size={16} className="text-[var(--accent-primary)]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                  Detected Architecture Layers ({Object.keys(report.layers).length})
                </h3>
              </div>

              <div className="flex flex-col gap-2">
                {Object.entries(report.layers).map(([name, files]) => (
                  <div key={name} className="rounded-lg border overflow-hidden"
                    style={{ borderColor: 'var(--border-color)' }}
                  >
                    <button
                      onClick={() => toggleLayer(name)}
                      className="w-full flex items-center justify-between p-3 text-left transition-all"
                      style={{ backgroundColor: 'var(--bg-primary)' }}
                    >
                      <div className="flex items-center gap-2">
                        {expandedLayers.has(name) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        <span className="text-sm font-bold font-mono text-[var(--text-primary)]">{name}</span>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                        style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
                      >
                        {files.length} files
                      </span>
                    </button>

                    <AnimatePresence>
                      {expandedLayers.has(name) && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="border-t overflow-hidden"
                          style={{ borderColor: 'var(--border-color)' }}
                        >
                          <div className="p-3 flex flex-col gap-1 max-h-[160px] overflow-y-auto scrollbar-thin">
                            {files.map((f) => (
                              <div key={f} className="flex items-center gap-2 text-xs font-mono text-[var(--text-secondary)] truncate">
                                <FileCode size={12} className="text-[var(--text-muted)] flex-shrink-0" />
                                <span className="truncate">{f}</span>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Circular Dependencies ── */}
            {report.circular_dependencies.length > 0 && (
              <div className="rounded-xl border p-5 flex flex-col gap-3"
                style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'rgba(251, 113, 133, 0.15)' }}
              >
                <div className="flex items-center gap-2">
                  <GitBranch size={16} className="text-[var(--accent-rose)]" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--accent-rose)]">
                    Circular Dependencies ({report.circular_dependencies.length})
                  </h3>
                </div>
                <div className="flex flex-col gap-2 max-h-[200px] overflow-y-auto scrollbar-thin">
                  {report.circular_dependencies.map((cycle, i) => (
                    <div key={i} className="p-3 rounded-lg text-xs font-mono leading-relaxed"
                      style={{ backgroundColor: 'rgba(251, 113, 133, 0.04)', border: '1px solid rgba(251, 113, 133, 0.12)', color: 'var(--accent-rose)' }}
                    >
                      {cycle.join(' → ')}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Dead Code ── */}
            {report.dead_code.length > 0 && (
              <div className="rounded-xl border p-5 flex flex-col gap-3"
                style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'rgba(250, 204, 21, 0.15)' }}
              >
                <div className="flex items-center gap-2">
                  <Code2 size={16} className="text-[var(--accent-yellow)]" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--accent-yellow)]">
                    Unreferenced Entities ({report.dead_code.length})
                  </h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[200px] overflow-y-auto scrollbar-thin">
                  {report.dead_code.map((dc, i) => (
                    <div key={i} className="flex items-center justify-between p-2.5 rounded-lg text-xs font-mono"
                      style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)' }}
                    >
                      <span className="truncate text-[var(--text-secondary)]">{dc.label}</span>
                      <span className="text-[8px] px-1.5 py-0.5 rounded font-bold uppercase"
                        style={{ backgroundColor: 'rgba(250, 204, 21, 0.08)', border: '1px solid rgba(250, 204, 21, 0.2)', color: 'var(--accent-yellow)' }}
                      >
                        {dc.node_type}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Violations ── */}
            {report.violations.length > 0 && (
              <div className="rounded-xl border p-5 flex flex-col gap-3"
                style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'rgba(251, 113, 133, 0.15)' }}
              >
                <div className="flex items-center gap-2">
                  <AlertCircle size={16} className="text-[var(--accent-rose)]" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--accent-rose)]">
                    Architectural Violations ({report.violations.length})
                  </h3>
                </div>
                <div className="flex flex-col gap-2 max-h-[200px] overflow-y-auto scrollbar-thin">
                  {report.violations.map((v, i) => (
                    <div key={i} className="p-3 rounded-lg text-xs leading-relaxed"
                      style={{ backgroundColor: 'rgba(251, 113, 133, 0.04)', border: '1px solid rgba(251, 113, 133, 0.12)' }}
                    >
                      <div className="text-[var(--accent-rose)] font-semibold mb-1">
                        {v.source_layer} → {v.target_layer}
                      </div>
                      <div className="text-[var(--text-secondary)]">{v.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full h-64 flex flex-col items-center justify-center gap-4 text-center"
          >
            <div className="glass-panel w-14 h-14 !rounded-xl flex items-center justify-center text-[var(--text-muted)]">
              <Shield size={24} />
            </div>
            <div className="max-w-xs flex flex-col gap-1.5">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">Architecture Ready</h3>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                Click Analyze to detect layers, find cycles, and compute a health score.
              </p>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};
