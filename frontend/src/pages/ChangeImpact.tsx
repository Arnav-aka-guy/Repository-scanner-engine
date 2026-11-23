import React, { useState } from 'react';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { analyzeChangeImpact, exportChangeImpact, ImpactReport } from '../services/impact';
import {
  GitBranch,
  AlertTriangle,
  ShieldAlert,
  CheckCircle,
  Copy,
  Download,
  FileCode,
  ArrowRight,
  RefreshCw,
  Search,
} from 'lucide-react';
import { colors, radius, font } from '../design-system/tokens';
import { Button, Badge, Panel as Card, FilePath } from '../design-system/primitives';

export const ChangeImpact: React.FC = () => {
  const repoPath = useWorkspaceStore((s) => s.activeRepository);
  const repoId = useWorkspaceStore((s) => s.activeRepositoryId);
  const files = useWorkspaceStore((s) => s.files);

  const [selectedFile, setSelectedFile] = useState<string>(files[0]?.path || '');
  const [symbolInput, setSymbolInput] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ImpactReport | null>(null);
  const [copiedTestCmd, setCopiedTestCmd] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'direct' | 'indirect' | 'consumers' | 'tests'>('direct');

  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    setReport(null);
    setError(null);
    setSelectedFile(files[0]?.path || '');
    return () => {
      abortRef.current?.abort();
    };
  }, [repoPath, repoId]);

  const filteredFiles = files.filter((f) =>
    f.path.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleRunAnalysis = async (fileToAnalyze?: string) => {
    const target = fileToAnalyze || selectedFile;
    if (!repoPath) {
      setError('Please open and scan a repository first.');
      return;
    }
    if (!target) {
      setError('Please select a target file to evaluate impact.');
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const symbols = symbolInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await analyzeChangeImpact(repoPath, [target], symbols, repoId);
      if (controller.signal.aborted) return;
      setReport(res);
    } catch (err: unknown) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : 'Change impact analysis failed.');
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  };

  const handleExportMarkdown = async () => {
    if (!repoPath || !report || report.target_files.length === 0) return;
    try {
      const data = await exportChangeImpact(
        repoPath,
        report.target_files,
        report.target_symbols,
        'markdown',
        repoId
      );
      const blob = new Blob([data.report], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `impact_report_${report.target_files[0].replace(/[/\\?%*:|"<>]/g, '_')}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to export markdown report.');
    }
  };

  const copyTestCommand = () => {
    if (!report || report.recommended_tests.length === 0) return;
    const cmd = `pytest ${report.recommended_tests.join(' ')}`;
    navigator.clipboard.writeText(cmd);
    setCopiedTestCmd(true);
    setTimeout(() => setCopiedTestCmd(false), 2000);
  };

  const getRiskColor = (level: string) => {
    switch (level.toLowerCase()) {
      case 'critical':
        return colors.status.danger;
      case 'high':
        return colors.accent.signal;
      case 'medium':
        return colors.status.warning;
      case 'low':
      default:
        return colors.status.success;
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
            <GitBranch size={18} style={{ color: colors.accent.signal }} />
          </div>
          <div>
            <h1 className="text-[18px] font-semibold leading-tight tracking-[-0.01em] flex items-center gap-2">
              Change Impact Analysis
              <span className="rounded-full border border-line px-2 py-px text-[12px] font-medium text-fg-3">
                Engine v2.1
              </span>
            </h1>
            <p className="text-xs" style={{ color: colors.text.secondary }}>
              Map blast radius, upstream dependents, affected API routes, and recommended tests
              before pushing code.
            </p>
          </div>
        </div>

        {report && (
          <Button
            size="sm"
            variant="secondary"
            icon={<Download size={14} />}
            onClick={handleExportMarkdown}
          >
            Export Report (.md)
          </Button>
        )}
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

        {/* Input Configuration Card */}
        <Card
          style={{
            backgroundColor: colors.bg.surface,
            borderColor: colors.border.default,
            padding: '16px',
          }}
        >
          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div className="flex-1 flex flex-col gap-1.5 w-full">
              <label className="text-xs font-mono" style={{ color: colors.text.secondary }}>
                Target Modified File
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Select or enter relative file path (e.g. backend/api/auth.py)"
                  value={selectedFile}
                  onChange={(e) => {
                    setSelectedFile(e.target.value);
                    setSearchTerm(e.target.value);
                  }}
                  className="w-full text-xs font-mono px-3 py-2 rounded border focus:outline-none"
                  style={{
                    backgroundColor: colors.bg.surfaceSecondary,
                    borderColor: colors.border.default,
                    color: colors.text.primary,
                  }}
                />
              </div>

              {searchTerm && filteredFiles.length > 0 && selectedFile !== searchTerm && (
                <div
                  className="max-h-40 overflow-y-auto rounded border shadow-lg z-20 mt-1 flex flex-col"
                  style={{
                    backgroundColor: colors.bg.surfaceSecondary,
                    borderColor: colors.border.default,
                  }}
                >
                  {filteredFiles.slice(0, 8).map((f) => (
                    <button
                      key={f.path}
                      onClick={() => {
                        setSelectedFile(f.path);
                        setSearchTerm('');
                      }}
                      className="text-left text-xs font-mono px-3 py-1.5 hover:bg-slate-800/80 transition-colors flex items-center justify-between"
                    >
                      <span className="truncate">{f.path}</span>
                      <span className="text-[11.5px] text-slate-500">{f.language}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="w-full md:w-72 flex flex-col gap-1.5">
              <label className="text-xs font-mono" style={{ color: colors.text.secondary }}>
                Optional Changed Symbols
              </label>
              <input
                type="text"
                placeholder="e.g. verify_token, UserRepo"
                value={symbolInput}
                onChange={(e) => setSymbolInput(e.target.value)}
                className="w-full text-xs font-mono px-3 py-2 rounded border focus:outline-none"
                style={{
                  backgroundColor: colors.bg.surfaceSecondary,
                  borderColor: colors.border.default,
                  color: colors.text.primary,
                }}
              />
            </div>

            <Button
              variant="primary"
              size="md"
              loading={loading}
              onClick={() => handleRunAnalysis()}
              icon={<Search size={14} />}
            >
              Analyze Impact
            </Button>
          </div>
        </Card>

        {/* Empty State when no report */}
        {!report && !loading && (
          <div
            className="p-12 rounded border text-center flex flex-col items-center justify-center gap-3"
            style={{
              backgroundColor: colors.bg.surfaceSecondary,
              borderColor: colors.border.subtle,
            }}
          >
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center"
              style={{ backgroundColor: colors.accent.signalSubtle }}
            >
              <GitBranch size={24} style={{ color: colors.accent.signal }} />
            </div>
            <div className="max-w-md">
              <h3 className="text-sm font-semibold text-slate-200">No Target File Selected</h3>
              <p className="text-xs text-slate-400 mt-1">
                Select a file from your repository to compute its full impact blast radius across
                classes, callers, downstream modules, and test suites.
              </p>
            </div>
          </div>
        )}

        {/* Report Results */}
        {report && (
          <div className="flex flex-col gap-6">
            {/* Top Score & Summary Banner */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Risk Level Card */}
              <Card
                style={{
                  backgroundColor: colors.bg.surface,
                  borderColor: colors.border.default,
                  padding: '16px',
                }}
              >
                <div className="text-xs font-mono text-slate-400 mb-1">
                  Regression Risk Score
                </div>
                <div className="flex items-baseline gap-2">
                  <span
                    className="text-3xl font-mono font-bold tabular-nums"
                    style={{ color: getRiskColor(report.risk_level) }}
                  >
                    {report.risk_score}
                  </span>
                  <span className="text-xs font-mono text-slate-500">/ 100</span>
                  <span
                    className="ml-auto text-xs font-mono font-semibold px-2 py-0.5 rounded border"
                    style={{
                      borderColor: getRiskColor(report.risk_level),
                      color: getRiskColor(report.risk_level),
                      backgroundColor: `${getRiskColor(report.risk_level)}15`,
                    }}
                  >
                    {report.risk_level} Risk
                  </span>
                </div>
                {/* Progress bar */}
                <div className="w-full bg-slate-800 h-1.5 rounded-full mt-3 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(report.risk_score, 100)}%`,
                      backgroundColor: getRiskColor(report.risk_level),
                    }}
                  />
                </div>
              </Card>

              {/* Total Affected Card */}
              <Card
                style={{
                  backgroundColor: colors.bg.surface,
                  borderColor: colors.border.default,
                  padding: '16px',
                }}
              >
                <div className="text-xs font-mono text-slate-400 mb-1">
                  Total Blast Radius
                </div>
                <div className="text-3xl font-mono font-bold tabular-nums text-slate-200">
                  {report.total_affected_count}
                </div>
                <div className="text-xs text-slate-400 mt-2 flex items-center gap-1.5">
                  <span className="text-amber-400 font-mono font-semibold">
                    {report.directly_affected_modules.length}
                  </span>{' '}
                  direct,{' '}
                  <span className="text-blue-400 font-mono font-semibold">
                    {report.indirectly_affected_modules.length}
                  </span>{' '}
                  indirect
                </div>
              </Card>

              {/* API Consumers Card */}
              <Card
                style={{
                  backgroundColor: colors.bg.surface,
                  borderColor: colors.border.default,
                  padding: '16px',
                }}
              >
                <div className="text-xs font-mono text-slate-400 mb-1">
                  API Consumers Touched
                </div>
                <div className="text-3xl font-mono font-bold tabular-nums text-slate-200">
                  {report.api_consumers.length}
                </div>
                <div className="text-xs text-slate-400 mt-2">
                  {report.api_consumers.length > 0 ? (
                    <span className="text-rose-400">Public endpoints may regress</span>
                  ) : (
                    <span className="text-emerald-400">No public routes affected</span>
                  )}
                </div>
              </Card>

              {/* Recommended Tests Card */}
              <Card
                style={{
                  backgroundColor: colors.bg.surface,
                  borderColor: colors.border.default,
                  padding: '16px',
                }}
              >
                <div className="text-xs font-mono text-slate-400 mb-1">
                  Recommended Test Suites
                </div>
                <div className="text-3xl font-mono font-bold tabular-nums text-slate-200">
                  {report.recommended_tests.length}
                </div>
                <div className="text-xs text-slate-400 mt-2">
                  {report.recommended_tests.length > 0 ? (
                    <button
                      onClick={copyTestCommand}
                      className="text-xs font-mono text-amber-400 hover:underline flex items-center gap-1"
                    >
                      <Copy size={11} />
                      {copiedTestCmd ? 'Copied Command!' : 'Copy pytest command'}
                    </button>
                  ) : (
                    <span className="text-rose-400">No matching test files found</span>
                  )}
                </div>
              </Card>
            </div>

            {/* Risk Factor Breakdown Card */}
            {report.risk_factors.length > 0 && (
              <div
                className="p-4 rounded border text-xs flex flex-col gap-2"
                style={{
                  backgroundColor: colors.bg.surface,
                  borderColor: colors.border.default,
                }}
              >
                <span className="font-mono font-semibold text-slate-300">
                  Risk Factors & Drivers
                </span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {report.risk_factors.map((factor, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 font-mono text-[11px] text-slate-400"
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                      <span>{factor}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Detail Tabs */}
            <div className="flex border-b text-xs font-mono" style={{ borderColor: colors.border.default }}>
              <button
                onClick={() => setActiveTab('direct')}
                className={`px-4 py-2 border-b-2 font-medium transition-colors ${
                  activeTab === 'direct'
                    ? 'border-amber-400 text-amber-400 bg-amber-400/5'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Direct Dependents ({report.directly_affected_modules.length})
              </button>
              <button
                onClick={() => setActiveTab('indirect')}
                className={`px-4 py-2 border-b-2 font-medium transition-colors ${
                  activeTab === 'indirect'
                    ? 'border-amber-400 text-amber-400 bg-amber-400/5'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Indirect Downstream ({report.indirectly_affected_modules.length})
              </button>
              <button
                onClick={() => setActiveTab('consumers')}
                className={`px-4 py-2 border-b-2 font-medium transition-colors ${
                  activeTab === 'consumers'
                    ? 'border-amber-400 text-amber-400 bg-amber-400/5'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                API Consumers ({report.api_consumers.length})
              </button>
              <button
                onClick={() => setActiveTab('tests')}
                className={`px-4 py-2 border-b-2 font-medium transition-colors ${
                  activeTab === 'tests'
                    ? 'border-amber-400 text-amber-400 bg-amber-400/5'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Recommended Tests ({report.recommended_tests.length})
              </button>
            </div>

            {/* Tab Contents */}
            <Card
              style={{
                backgroundColor: colors.bg.surface,
                borderColor: colors.border.default,
                padding: '0',
                overflow: 'hidden',
              }}
            >
              {activeTab === 'direct' && (
                <div className="divide-y divide-slate-800">
                  {report.directly_affected_modules.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-500 font-mono">
                      No direct downstream dependents found.
                    </div>
                  ) : (
                    report.directly_affected_modules.map((mod, idx) => (
                      <div key={idx} className="p-4 flex items-start justify-between gap-4">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <FileCode size={14} className="text-amber-400" />
                            <span className="text-xs font-mono font-medium text-slate-200">
                              {mod.file_path}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400">{mod.reason}</p>
                          {mod.imported_symbols.length > 0 && (
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              <span className="text-[12px] text-slate-500">Imports:</span>
                              {mod.imported_symbols.map((sym, sIdx) => (
                                <span
                                  key={sIdx}
                                  className="text-[12px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700"
                                >
                                  {sym}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setSelectedFile(mod.file_path);
                            handleRunAnalysis(mod.file_path);
                          }}
                        >
                          Trace Further <ArrowRight size={12} className="ml-1" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === 'indirect' && (
                <div className="divide-y divide-slate-800">
                  {report.indirectly_affected_modules.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-500 font-mono">
                      No indirect downstream dependents found.
                    </div>
                  ) : (
                    report.indirectly_affected_modules.map((mod, idx) => (
                      <div key={idx} className="p-4 flex items-start justify-between gap-4">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <FileCode size={14} className="text-blue-400" />
                            <span className="text-xs font-mono font-medium text-slate-200">
                              {mod.file_path}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400">{mod.reason}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === 'consumers' && (
                <div className="divide-y divide-slate-800">
                  {report.api_consumers.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-500 font-mono">
                      No API routes or consumers directly or indirectly affected.
                    </div>
                  ) : (
                    report.api_consumers.map((consumer, idx) => (
                      <div key={idx} className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-rose-400 font-mono text-xs font-bold">[API]</span>
                          <span className="text-xs font-mono text-slate-200">{consumer}</span>
                        </div>
                        <span className="text-[12px] px-2 py-0.5 rounded bg-rose-950/40 text-rose-300 border border-rose-900/50">
                          Route Vulnerable
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === 'tests' && (
                <div className="p-4 flex flex-col gap-4">
                  {report.recommended_tests.length === 0 ? (
                    <div className="p-4 text-center text-xs text-rose-400 font-mono">
                      ⚠️ Zero test files cover this module or its downstream dependents!
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between bg-slate-900 p-3 rounded border border-slate-800">
                        <span className="text-xs font-mono text-slate-300">
                          pytest {report.recommended_tests.join(' ')}
                        </span>
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={<Copy size={12} />}
                          onClick={copyTestCommand}
                        >
                          {copiedTestCmd ? 'Copied!' : 'Copy Command'}
                        </Button>
                      </div>
                      <div className="divide-y divide-slate-800">
                        {report.recommended_tests.map((testFile, idx) => (
                          <div key={idx} className="py-2.5 flex items-center gap-2">
                            <CheckCircle size={14} className="text-emerald-400" />
                            <span className="text-xs font-mono text-slate-200">{testFile}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};
export default ChangeImpact;
