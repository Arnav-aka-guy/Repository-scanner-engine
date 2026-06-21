import React, { useState } from 'react';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { generateDocumentation } from '../services/documentation';
import {
  FileText,
  Cpu,
  BookOpen,
  Layers,
  Code2,
  GitBranch,
  Copy,
  Check,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { motion } from 'framer-motion';

type DocTab = 'overview' | 'architecture' | 'api_reference' | 'dependency_map' | 'modules';

interface DocsData {
  overview: string;
  architecture: string;
  modules: Record<string, string>;
  api_reference?: string;
  dependency_map?: string;
}

const TAB_CONFIG: { key: DocTab; label: string; icon: React.ReactNode }[] = [
  { key: 'overview', label: 'Onboarding README', icon: <BookOpen size={14} /> },
  { key: 'architecture', label: 'System Architecture', icon: <Layers size={14} /> },
  { key: 'api_reference', label: 'API Reference', icon: <Code2 size={14} /> },
  { key: 'dependency_map', label: 'Dependency Map', icon: <GitBranch size={14} /> },
];

export const DocumentationGenerator: React.FC = () => {
  const repoPath = useWorkspaceStore((s) => s.activeRepository) || '';
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DocTab>('overview');
  const [docsData, setDocsData] = useState<DocsData | null>(null);
  const [activeModulePath, setActiveModulePath] = useState('');
  const [copied, setCopied] = useState(false);

  const handleGenerate = async (format: 'markdown' | 'html' = 'markdown') => {
    if (!repoPath) return;
    setLoading(true);
    setError(null);
    try {
      const res = await generateDocumentation(repoPath, format);
      setDocsData(res.docs as DocsData);
      const moduleKeys = Object.keys(res.docs?.modules || {});
      if (moduleKeys.length > 0) {
        setActiveModulePath(moduleKeys[0]);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate documentation.');
    } finally {
      setLoading(false);
    }
  };

  const getActiveContent = (): string => {
    if (!docsData) return '';
    switch (activeTab) {
      case 'overview': return docsData.overview || '';
      case 'architecture': return docsData.architecture || '';
      case 'api_reference': return docsData.api_reference || '*API reference will appear after generation.*';
      case 'dependency_map': return docsData.dependency_map || '*Dependency map will appear after generation.*';
      case 'modules': return docsData.modules[activeModulePath] || '';
      default: return '';
    }
  };

  const handleCopy = async () => {
    const text = getActiveContent();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div className="flex-grow flex flex-col overflow-hidden h-full">
      {/* Header */}
      <div
        className="px-6 py-4 border-b flex flex-wrap items-center justify-between gap-4 select-none"
        style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
      >
        <div className="flex items-center gap-2.5">
          <span className="text-[var(--accent-primary)]"><FileText size={20} /></span>
          <h1 className="text-sm font-bold uppercase tracking-wider text-[var(--text-primary)]">
            Documentation Engine
          </h1>
          {docsData && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold ml-2"
              style={{ backgroundColor: 'rgba(166, 227, 161, 0.08)', border: '1px solid rgba(166, 227, 161, 0.2)', color: 'var(--accent-green)' }}
            >
              5 DOCS READY
            </span>
          )}
        </div>

        <button
          onClick={() => handleGenerate('markdown')}
          disabled={loading || !repoPath}
          className="btn-primary !py-2 !px-4 !text-xs"
        >
          <Cpu size={12} />
          <span>Generate Documentation Suite</span>
        </button>
      </div>

      {/* Main Layout */}
      <div className="flex-1 flex overflow-hidden w-full h-full relative">
        {error && (
          <div className="absolute top-4 left-4 right-4 z-50 p-3 rounded-lg flex items-center gap-3 text-xs"
            style={{ backgroundColor: 'rgba(251, 113, 133, 0.05)', border: '1px solid rgba(251, 113, 133, 0.2)', color: 'var(--accent-rose)' }}
          >
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[var(--bg-primary)] z-10">
            <Loader2 size={36} className="animate-spin text-[var(--accent-primary)]" />
            <span className="text-sm font-semibold font-mono text-[var(--text-secondary)]">
              Compiling 5 documentation artifacts ...
            </span>
          </div>
        ) : !repoPath ? (
          <div className="flex-grow flex items-center justify-center italic text-sm text-[var(--text-muted)]">
            Scan a repository in the Explorer view to compile documentation.
          </div>
        ) : docsData ? (
          <div className="flex-grow flex overflow-hidden h-full w-full">
            {/* Sidebar */}
            <motion.div
              initial={{ x: -10, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="border-r h-full overflow-hidden flex flex-col select-none"
              style={{ width: '240px', backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
            >
              {/* Core Doc Tabs */}
              <div className="p-3 border-b flex flex-col gap-1" style={{ borderColor: 'var(--border-color)' }}>
                {TAB_CONFIG.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className="flex items-center gap-2 w-full p-2.5 text-xs rounded-lg text-left font-semibold transition-all duration-150"
                    style={{
                      backgroundColor: activeTab === tab.key ? 'var(--bg-tertiary)' : 'transparent',
                      color: activeTab === tab.key ? 'var(--text-primary)' : 'var(--text-muted)',
                    }}
                  >
                    {tab.icon}
                    <span>{tab.label}</span>
                  </button>
                ))}
              </div>

              {/* Module References */}
              <div className="flex-grow overflow-y-auto p-3 flex flex-col gap-1.5 scrollbar-thin">
                <span className="text-[10px] font-bold font-mono uppercase tracking-wider text-[var(--text-muted)] pl-2 pb-1 block border-b"
                  style={{ borderColor: 'var(--border-color)' }}
                >
                  Module References ({Object.keys(docsData.modules || {}).length})
                </span>
                <div className="flex flex-col gap-0.5 mt-2">
                  {Object.keys(docsData.modules || {}).map((path) => (
                    <button
                      key={path}
                      onClick={() => { setActiveTab('modules'); setActiveModulePath(path); }}
                      className="text-left truncate text-xs p-2 rounded transition-all duration-150 font-mono"
                      style={{
                        backgroundColor: activeTab === 'modules' && activeModulePath === path ? 'var(--bg-tertiary)' : 'transparent',
                        color: activeTab === 'modules' && activeModulePath === path ? 'var(--text-primary)' : 'var(--text-secondary)',
                      }}
                    >
                      {path.split(/[\\/]+/).pop()}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>

            {/* Document Viewport */}
            <div className="flex-grow flex flex-col overflow-hidden h-full relative">
              {/* Control bar */}
              <div
                className="px-6 py-2 border-b flex items-center justify-between select-none"
                style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-[var(--text-muted)]">
                    {activeTab === 'modules' ? activeModulePath : activeTab.replace('_', ' ').toUpperCase()}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                    style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}
                  >
                    .md
                  </span>
                </div>

                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[11px] font-semibold transition-all duration-200 hover:bg-[var(--bg-tertiary)]"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {copied ? (
                    <><Check size={12} className="text-green-400" /><span className="text-green-400">Copied!</span></>
                  ) : (
                    <><Copy size={12} /><span>Copy</span></>
                  )}
                </button>
              </div>

              {/* Rendered Content */}
              <div className="flex-1 overflow-y-auto p-8 scrollbar-thin select-text"
                style={{ backgroundColor: 'rgba(10, 10, 18, 0.3)' }}
              >
                <motion.div
                  key={activeTab + activeModulePath}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                  className="max-w-3xl w-full mx-auto p-8 rounded-xl border leading-relaxed"
                  style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
                >
                  <pre
                    className="whitespace-pre-wrap font-sans text-xs text-[var(--text-secondary)] leading-relaxed select-text"
                    style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
                  >
                    {getActiveContent()}
                  </pre>
                </motion.div>
              </div>
            </div>
          </div>
        ) : (
          /* Empty state */
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex-grow flex flex-col items-center justify-center gap-4 text-center max-w-sm mx-auto"
          >
            <div className="glass-panel w-14 h-14 !rounded-xl flex items-center justify-center text-[var(--text-muted)]">
              <FileText size={24} />
            </div>
            <div className="flex flex-col gap-1.5">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">Documentation Ready</h3>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                Generate 5 documentation artifacts: README, Architecture Guide, API Reference, Dependency Map, and Module References.
              </p>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};
