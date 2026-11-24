import React, { useState } from 'react';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { runCodeReview, CodeReviewResponse, ReviewFinding } from '../services/review';
import {
  ShieldCheck,
  AlertOctagon,
  AlertTriangle,
  Info,
  Bug,
  Shield,
  Zap,
  CheckCircle,
  FileText,
  Play,
  Filter,
  Sparkles,
} from 'lucide-react';
import { colors, radius, font } from '../design-system/tokens';
import { Button, Panel as Card, Badge, FilePath } from '../design-system/primitives';

export const CodeReview: React.FC = () => {
  const repoPath = useWorkspaceStore((s) => s.activeRepository);
  const repoId = useWorkspaceStore((s) => s.activeRepositoryId);

  const [inputMode, setInputMode] = useState<'working_tree' | 'custom_diff'>('working_tree');
  const [customDiff, setCustomDiff] = useState<string>('');
  const [useLlm, setUseLlm] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<CodeReviewResponse | null>(null);

  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    setReport(null);
    setError(null);
    return () => {
      abortRef.current?.abort();
    };
  }, [repoPath, repoId]);

  // Filters
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');

  const handleRunReview = async () => {
    if (!repoPath && inputMode === 'working_tree') {
      setError('Please open a repository to inspect working tree diffs.');
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const diffToSend = inputMode === 'custom_diff' ? customDiff : undefined;
      const res = await runCodeReview(repoPath || '.', diffToSend, useLlm, repoId);
      if (controller.signal.aborted) return;
      setReport(res);
    } catch (err: unknown) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : 'Code review failed.');
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  };

  const filteredFindings = (report?.findings || []).filter((f) => {
    if (selectedCategory !== 'all' && f.category.toLowerCase() !== selectedCategory.toLowerCase()) {
      return false;
    }
    if (selectedSeverity !== 'all' && f.severity.toLowerCase() !== selectedSeverity.toLowerCase()) {
      return false;
    }
    return true;
  });

  const getSeverityBadge = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'critical':
        return (
          <span className="text-[12px] px-2 py-0.5 rounded border font-bold bg-rose-950/60 border-rose-600 text-rose-300">
            Critical
          </span>
        );
      case 'high':
        return (
          <span className="text-[12px] px-2 py-0.5 rounded border font-bold bg-amber-950/60 border-amber-500 text-amber-300">
            High
          </span>
        );
      case 'medium':
        return (
          <span className="text-[12px] px-2 py-0.5 rounded border font-bold bg-yellow-950/50 border-yellow-500 text-yellow-300">
            Medium
          </span>
        );
      case 'low':
      default:
        return (
          <span className="text-[12px] px-2 py-0.5 rounded border font-bold bg-slate-900 border-slate-700 text-slate-300">
            Low
          </span>
        );
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category.toLowerCase()) {
      case 'security':
        return <Shield size={14} className="text-rose-400" />;
      case 'bug':
        return <Bug size={14} className="text-amber-400" />;
      case 'performance':
        return <Zap size={14} className="text-yellow-400" />;
      case 'missing_test':
        return <AlertOctagon size={14} className="text-purple-400" />;
      default:
        return <Info size={14} className="text-blue-400" />;
    }
  };

  return (
    <div
      className="flex-1 flex flex-col overflow-y-auto"
      style={{
        backgroundColor: colors.bg.primary,
        color: colors.text.primary,
        fontFamily: font.sans,
      }}
    >
      {/* Header Bar */}
      <div
        className="px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-3 border-b"
        style={{
          borderColor: colors.border.default,
          backgroundColor: colors.bg.surface,
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded flex items-center justify-center"
            style={{ backgroundColor: colors.accent.signalSubtle }}
          >
            <ShieldCheck size={18} style={{ color: colors.accent.signal }} />
          </div>
          <div>
            <h1 className="text-[18px] font-semibold leading-tight tracking-[-0.01em] flex items-center gap-2">
              Automated Code Review
              <span className="rounded-full border border-line px-2 py-px text-[12px] font-medium text-fg-3">
                Engine v2.1
              </span>
            </h1>
            <p className="text-xs" style={{ color: colors.text.secondary }}>
              Automated deterministic vulnerability & anti-pattern scanning with optional AI
              grounded review.
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 max-w-7xl mx-auto w-full flex flex-col gap-6">
        {error && (
          <div
            className="p-3 rounded text-xs flex items-center gap-2 border"
            style={{
              backgroundColor: colors.status.dangerSubtle,
              borderColor: colors.status.dangerBorder,
              color: colors.status.danger,
            }}
          >
            <AlertTriangle size={15} />
            <span>{error}</span>
          </div>
        )}

        {/* Configuration Card */}
        <Card
          style={{
            backgroundColor: colors.bg.surface,
            borderColor: colors.border.default,
            padding: '16px',
          }}
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              {/* Input mode selection */}
              <div className="flex items-center gap-2 text-[12px] font-sans">
                <button
                  onClick={() => setInputMode('working_tree')}
                  className={`px-3 py-1.5 rounded transition-colors ${
                    inputMode === 'working_tree'
                      ? 'bg-fg text-black font-semibold'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  Working Directory Diff
                </button>
                <button
                  onClick={() => setInputMode('custom_diff')}
                  className={`px-3 py-1.5 rounded transition-colors ${
                    inputMode === 'custom_diff'
                      ? 'bg-fg text-black font-semibold'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  Paste Git Diff / PR Patch
                </button>
              </div>

              {/* Mode toggle: Deterministic vs AI Assisted */}
              <div className="flex items-center gap-2">
                <label className="text-[12px] font-sans text-slate-300 flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useLlm}
                    onChange={(e) => setUseLlm(e.target.checked)}
                    className="rounded border-slate-700 text-amber-500 focus:ring-amber-400 bg-slate-900"
                  />
                  <Sparkles size={14} className={useLlm ? 'text-amber-400' : 'text-slate-500'} />
                  <span>AI Reasoning Mode</span>
                </label>
              </div>
            </div>

            {inputMode === 'custom_diff' && (
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-sans text-slate-400">
                  Raw Git Diff or Patch
                </label>
                <textarea
                  rows={6}
                  placeholder="diff --git a/src/app.py b/src/app.py&#10;--- a/src/app.py&#10;+++ b/src/app.py&#10;@@ -1,3 +1,4 @@&#10;+ query = f'SELECT * FROM users WHERE id = {token}'"
                  value={customDiff}
                  onChange={(e) => setCustomDiff(e.target.value)}
                  className="w-full text-xs font-mono p-3 rounded border focus:outline-none"
                  style={{
                    backgroundColor: colors.bg.surfaceSecondary,
                    borderColor: colors.border.default,
                    color: colors.text.primary,
                  }}
                />
              </div>
            )}

            <div className="flex justify-end">
              <Button
                variant="primary"
                size="md"
                loading={loading}
                onClick={handleRunReview}
                icon={<Play size={14} />}
              >
                Run Code Review
              </Button>
            </div>
          </div>
        </Card>

        {/* Report Overview Banner */}
        {report && (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Card
                style={{
                  backgroundColor: colors.bg.surface,
                  borderColor: colors.border.default,
                  padding: '12px',
                }}
              >
                <div className="text-[11px] font-mono text-slate-400">Total Findings</div>
                <div className="text-2xl font-mono font-bold text-slate-200 mt-1">
                  {report.total_findings}
                </div>
              </Card>

              <Card
                style={{
                  backgroundColor: colors.bg.surface,
                  borderColor: colors.border.default,
                  padding: '12px',
                }}
              >
                <div className="text-[11px] font-mono text-rose-400">Critical</div>
                <div className="text-2xl font-mono font-bold text-rose-400 mt-1">
                  {report.critical_count}
                </div>
              </Card>

              <Card
                style={{
                  backgroundColor: colors.bg.surface,
                  borderColor: colors.border.default,
                  padding: '12px',
                }}
              >
                <div className="text-[11px] font-mono text-amber-400">High</div>
                <div className="text-2xl font-mono font-bold text-amber-400 mt-1">
                  {report.high_count}
                </div>
              </Card>

              <Card
                style={{
                  backgroundColor: colors.bg.surface,
                  borderColor: colors.border.default,
                  padding: '12px',
                }}
              >
                <div className="text-[11px] font-mono text-yellow-400">Medium</div>
                <div className="text-2xl font-mono font-bold text-yellow-400 mt-1">
                  {report.medium_count}
                </div>
              </Card>

              <Card
                style={{
                  backgroundColor: colors.bg.surface,
                  borderColor: colors.border.default,
                  padding: '12px',
                }}
              >
                <div className="text-[11px] font-mono text-slate-400">Low</div>
                <div className="text-2xl font-mono font-bold text-slate-300 mt-1">
                  {report.low_count}
                </div>
              </Card>
            </div>

            {/* Filter Pills */}
            <div className="flex flex-wrap items-center justify-between gap-3 text-[12px] font-sans">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-slate-500 mr-1 flex items-center gap-1">
                  <Filter size={12} /> Category:
                </span>
                {['all', 'security', 'bug', 'performance', 'missing_test', 'quality'].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-2 py-0.5 rounded capitalize transition-colors ${
                      selectedCategory === cat
                        ? 'bg-fg text-black font-semibold'
                        : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {cat.replace('_', ' ')}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 mr-1">Severity:</span>
                {['all', 'critical', 'high', 'medium', 'low'].map((sev) => (
                  <button
                    key={sev}
                    onClick={() => setSelectedSeverity(sev)}
                    className={`px-2 py-0.5 rounded transition-colors ${
                      selectedSeverity === sev
                        ? 'bg-slate-200 text-slate-950 font-semibold'
                        : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {sev}
                  </button>
                ))}
              </div>
            </div>

            {/* Findings List */}
            <div className="flex flex-col gap-4">
              {filteredFindings.length === 0 ? (
                <div
                  className="p-10 rounded border text-center flex flex-col items-center justify-center gap-2"
                  style={{
                    backgroundColor: colors.bg.surface,
                    borderColor: colors.border.default,
                  }}
                >
                  <CheckCircle size={28} className="text-emerald-400" />
                  <span className="text-xs font-mono text-slate-300">
                    No findings match the current filter criteria!
                  </span>
                </div>
              ) : (
                filteredFindings.map((finding, idx) => (
                  <Card
                    key={idx}
                    style={{
                      backgroundColor: colors.bg.surface,
                      borderColor: colors.border.default,
                      padding: '16px',
                    }}
                  >
                    <div className="flex flex-col gap-3">
                      {/* Top finding meta row */}
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          {getSeverityBadge(finding.severity)}
                          <div className="flex items-center gap-1 text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                            {getCategoryIcon(finding.category)}
                            <span className="capitalize">{finding.category.replace('_', ' ')}</span>
                          </div>
                          <span className="text-xs font-mono text-slate-400">
                            {finding.file_path}:{finding.line_start}
                            {finding.line_end !== finding.line_start ? `-${finding.line_end}` : ''}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] text-slate-500">
                            Confidence: {Math.round(finding.confidence * 100)}%
                          </span>
                          <span className="text-[12px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                            {finding.source}
                          </span>
                        </div>
                      </div>

                      {/* Finding Title & Explanation */}
                      <div>
                        <h4 className="text-sm font-semibold text-slate-200">{finding.title}</h4>
                        <p className="text-xs text-slate-400 mt-1">{finding.explanation}</p>
                      </div>

                      {/* Code Evidence */}
                      {finding.evidence && (
                        <div className="flex flex-col gap-1">
                          <span className="text-[12px] text-slate-500">
                            Evidence Snippet
                          </span>
                          <pre className="text-xs font-mono p-2.5 rounded bg-slate-950 border border-slate-800 text-rose-300 overflow-x-auto">
                            <code>{finding.evidence}</code>
                          </pre>
                        </div>
                      )}

                      {/* Suggested Fix */}
                      {finding.suggested_fix && (
                        <div className="flex flex-col gap-1">
                          <span className="text-[12px] text-slate-500">
                            Suggested Fix
                          </span>
                          <pre className="text-xs font-mono p-2.5 rounded bg-slate-950 border border-slate-800 text-emerald-300 overflow-x-auto">
                            <code>{finding.suggested_fix}</code>
                          </pre>
                        </div>
                      )}
                    </div>
                  </Card>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
export default CodeReview;
