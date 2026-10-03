import React, { useState } from 'react';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { FileTree } from '../components/FileTree';
import { CodeBlock } from '../components/CodeBlock';
import { ScanProgress } from '../components/ScanProgress';
import {
  FolderOpen,
  Code,
  Info,
  AlertTriangle,
  Loader2,
  ScanLine,
  FileCode2,
  Hash,
} from 'lucide-react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.1 },
  },
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring', stiffness: 300, damping: 24 },
  },
};

const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const } },
};

const getEntityBadgeClass = (type: string) => {
  switch (type) {
    case 'class':
      return 'badge badge-purple';
    case 'function':
      return 'badge badge-green';
    case 'method':
      return 'badge badge-yellow';
    default:
      return 'badge badge-blue';
  }
};

const LANGUAGE_BADGE_COLORS: Record<string, string> = {
  python: 'badge-yellow',
  javascript: 'badge-yellow',
  typescript: 'badge-blue',
  html: 'badge-rose',
  css: 'badge-purple',
  java: 'badge-rose',
  go: 'badge-green',
  rust: 'badge-rose',
  c: 'badge-blue',
  cpp: 'badge-blue',
};

export const RepositoryExplorer: React.FC = () => {
  const activeRepository = useWorkspaceStore((s) => s.activeRepository);
  const scanStatus = useWorkspaceStore((s) => s.scanStatus);
  const scanError = useWorkspaceStore((s) => s.scanError);
  const repositoryInfo = useWorkspaceStore((s) => s.repositoryInfo);
  const fileTree = useWorkspaceStore((s) => s.fileTree);
  const selectedFilePath = useWorkspaceStore((s) => s.selectedFilePath);
  const setSelectedFile = useWorkspaceStore((s) => s.setSelectedFile);
  const selectedFileDetail = useWorkspaceStore((s) => s.selectedFileDetail);
  const fileLoading = useWorkspaceStore((s) => s.fileLoading);
  const scanRepo = useWorkspaceStore((s) => s.scanRepo);
  const selectLocalDirectory = useWorkspaceStore((s) => s.selectLocalDirectory);

  const loading = scanStatus === 'scanning';
  const error = scanError;
  const repoPath = activeRepository || '';
  const repoInfo = repositoryInfo;

  const [inputPath, setInputPath] = useState<string>(repoPath || '');

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputPath.trim()) {
      scanRepo(inputPath.trim());
    }
  };

  return (
    <div className="flex-1 flex overflow-hidden w-full h-full">
      {/* ── Left Sidebar: File Tree Panel ── */}
      <motion.div
        initial={{ x: -20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] as const }}
        className="flex flex-col border-r h-full overflow-hidden select-none"
        style={{
          width: '280px',
          minWidth: '280px',
          backgroundColor: 'var(--bg-secondary)',
          borderColor: 'var(--border-color)',
        }}
      >
        {/* Panel Header */}
        <div
          className="p-4 border-b flex flex-col gap-3"
          style={{ borderColor: 'var(--border-color)' }}
        >
          <div className="flex items-center gap-2">
            <ScanLine size={12} className="text-[var(--accent-primary)]" />
            <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--text-muted)]">
              Workspace
            </span>
          </div>

          <form onSubmit={onSubmit} className="flex gap-2">
            <input
              type="text"
              value={inputPath}
              onChange={(e) => setInputPath(e.target.value)}
              placeholder="Local folder or https://github.com/..."
              className="input-premium flex-1 !py-1.5 !px-2.5 !text-xs font-mono !rounded-lg"
            />
            {window.electronAPI && (
              <button
                type="button"
                onClick={selectLocalDirectory}
                className="btn-ghost !p-1.5 !rounded-lg"
                title="Browse Directory"
              >
                <FolderOpen size={14} />
              </button>
            )}
            <button
              type="submit"
              disabled={loading || !inputPath.trim()}
              className="btn-primary !px-3 !py-1.5 !text-xs !rounded-lg !gap-1"
            >
              <ScanLine size={12} />
              Scan
            </button>
          </form>
        </div>

        {/* Panel Body: File Tree */}
        <div className="flex-1 overflow-y-auto p-2 scrollbar-thin">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-4 px-4">
              <Loader2 size={24} className="animate-spin text-[var(--accent-primary)]" />
              <ScanProgress
                label={
                  inputPath.includes('github.com')
                    ? 'Cloning and indexing repository ...'
                    : 'Indexing repository ...'
                }
              />
            </div>
          ) : fileTree.length > 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.15 }}
            >
              <FileTree
                nodes={fileTree}
                onSelectFile={setSelectedFile}
                selectedPath={selectedFilePath}
              />
            </motion.div>
          ) : (
            <div className="text-center py-12 px-4 text-xs text-[var(--text-muted)] leading-relaxed italic">
              Enter a repository path above to index a project.
            </div>
          )}
        </div>
      </motion.div>

      {/* ── Right Main Panel ── */}
      <div className="flex-1 flex flex-col overflow-hidden h-full">
        {/* Error Banner */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -10, height: 0 }}
              transition={{ duration: 0.3 }}
              className="mx-4 mt-4"
            >
              <div className="glass-panel-subtle p-3 flex items-start gap-3 text-xs"
                style={{
                  borderColor: 'rgba(251, 113, 133, 0.2)',
                  background: 'rgba(251, 113, 133, 0.05)',
                }}
              >
                <AlertTriangle size={16} className="flex-shrink-0 mt-0.5 text-[var(--accent-rose)]" />
                <div className="flex-1 text-[var(--accent-rose)]">
                  <span className="font-semibold block mb-0.5">Error Occurred</span>
                  {error}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* File Loading State */}
        {fileLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            >
              <Loader2 size={32} className="text-[var(--accent-primary)]" />
            </motion.div>
            <span className="text-sm font-medium text-[var(--text-secondary)] font-mono">
              Parsing AST structures ...
            </span>
          </div>
        ) : selectedFilePath && selectedFileDetail ? (
          /* ── Code Viewer Mode ── */
          <motion.div
            key="code-viewer"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="flex-1 flex flex-col p-5 gap-4 overflow-y-auto scrollbar-thin"
          >
            {/* File path breadcrumb */}
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3 }}
              className="flex items-center gap-2 text-xs font-mono text-[var(--text-secondary)]"
            >
              <FileCode2 size={14} className="text-[var(--accent-primary)]" />
              <span className="text-[var(--text-muted)]">File:</span>
              <span className="font-semibold px-2 py-1 rounded-lg"
                style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)' }}
              >
                {selectedFilePath}
              </span>
            </motion.div>

            {/* Code Block */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
            >
              <CodeBlock
                code={selectedFileDetail.content}
                language={selectedFileDetail.language.toLowerCase()}
                fileName={selectedFilePath.split(/[\\/]+/).pop() || ''}
              />
            </motion.div>

            {/* Entity Cards */}
            {selectedFileDetail.entities && selectedFileDetail.entities.length > 0 && (
              <div className="flex flex-col gap-3 mt-2">
                <motion.h3
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5"
                >
                  <Code size={14} className="text-[var(--accent-purple)]" />
                  <span>Extracted AST Entities ({selectedFileDetail.entities.length})</span>
                </motion.h3>

                <motion.div
                  variants={containerVariants}
                  initial="hidden"
                  animate="visible"
                  className="grid grid-cols-1 md:grid-cols-2 gap-3.5"
                >
                  {selectedFileDetail.entities.map((ent: any, idx: number) => (
                    <motion.div
                      key={idx}
                      variants={cardVariants}
                      className="glass-panel-subtle p-4 flex flex-col gap-2 hover-lift cursor-default"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold font-mono text-[var(--text-primary)]">
                          {ent.name}
                        </span>
                        <span className={getEntityBadgeClass(ent.entity_type)}>
                          {ent.entity_type}
                        </span>
                      </div>

                      {ent.docstring ? (
                        <p className="text-xs text-[var(--text-secondary)] italic leading-relaxed line-clamp-3 p-2 rounded-lg"
                          style={{ background: 'rgba(10, 10, 18, 0.3)' }}
                        >
                          {ent.docstring}
                        </p>
                      ) : (
                        <span className="text-[10px] text-[var(--text-muted)] italic">
                          No docstring documented
                        </span>
                      )}

                      <div className="flex items-center gap-1.5 mt-auto">
                        <Hash size={10} className="text-[var(--text-muted)]" />
                        <span className="text-[10px] font-mono text-[var(--text-muted)]">
                          Lines {ent.start_line} – {ent.end_line}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              </div>
            )}
          </motion.div>
        ) : (
          /* ── Onboarding Hero Mode ── */
          <div className="flex-grow flex flex-col items-center justify-center p-8 text-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] as const }}
              className="glass-panel p-10 flex flex-col items-center justify-center gap-8 max-w-xl relative overflow-hidden"
            >
              {/* Gradient top border */}
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[var(--accent-primary)] via-[var(--accent-purple)] to-[var(--accent-green)]" />

              {/* Animated Logo */}
              <div className="relative flex items-center justify-center">
                {/* Rotating ring */}
                <div
                  className="absolute -inset-3 rounded-3xl border border-[var(--accent-purple)] opacity-20 animate-spin-slow"
                />
                {/* Pulsing glow circle */}
                <div
                  className="absolute inset-0 rounded-2xl animate-pulse-glow"
                  style={{
                    background: 'radial-gradient(circle, rgba(96, 165, 250, 0.12) 0%, transparent 70%)',
                  }}
                />
                <div
                  className="w-20 h-20 rounded-2xl flex items-center justify-center shadow-2xl relative z-10 glow-blue"
                  style={{
                    backgroundColor: 'rgba(96, 165, 250, 0.08)',
                    color: 'var(--accent-primary)',
                    border: '1px solid rgba(96, 165, 250, 0.25)',
                  }}
                >
                  <FolderOpen size={36} />
                </div>
              </div>

              {/* Title & Subtitle */}
              <motion.div
                variants={fadeInUp}
                initial="hidden"
                animate="visible"
                className="flex flex-col gap-3"
              >
                <h1 className="text-3xl font-extrabold tracking-tight text-gradient pb-1">
                  Antigravity Engine
                </h1>
                <p className="text-xs leading-relaxed text-[var(--text-secondary)] px-6 font-mono tracking-wide">
                  [SYSTEM STATUS: ONLINE] // HYBRID GRAPH-RAG SOURCE INTELLIGENCE
                </p>
                <p className="text-sm leading-relaxed text-[var(--text-secondary)] px-4 mt-1">
                  Analyze complex software structures, map function call graphs, run semantic vector queries, and consult the AI onboarding assistant.
                </p>
              </motion.div>

              {/* Stats or Placeholder */}
              {repoInfo ? (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3, duration: 0.4 }}
                  className="w-full flex flex-col gap-5 border-t pt-6 text-left"
                  style={{ borderColor: 'var(--border-color)' }}
                >
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    <Info size={14} className="text-[var(--accent-primary)]" />
                    <span>Workspace Telemetry</span>
                  </div>

                  {/* Stat Cards Grid */}
                  <div className="grid grid-cols-2 gap-4">
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.4, type: 'spring', stiffness: 300, damping: 24 }}
                      className="stat-card flex flex-col gap-1"
                    >
                      <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-bold">
                        Files Indexed
                      </span>
                      <span className="text-2xl font-extrabold text-[var(--text-primary)]">
                        {repoInfo.total_files}
                      </span>
                    </motion.div>
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.5, type: 'spring', stiffness: 300, damping: 24 }}
                      className="stat-card flex flex-col gap-1"
                    >
                      <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-bold">
                        Total Lines
                      </span>
                      <span className="text-2xl font-extrabold text-[var(--text-primary)]">
                        {repoInfo.total_lines.toLocaleString()}
                      </span>
                    </motion.div>
                  </div>

                  {/* Language Breakdown */}
                  <div className="w-full mt-1">
                    <span className="text-[var(--text-muted)] block mb-3 font-bold uppercase tracking-wider text-[10px]">
                      Language Breakdown
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(repoInfo.languages).map(([lang, count], i) => (
                        <motion.span
                          key={lang}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 0.55 + i * 0.05, type: 'spring', stiffness: 400, damping: 20 }}
                          className={`badge ${LANGUAGE_BADGE_COLORS[lang.toLowerCase()] || 'badge-blue'}`}
                        >
                          {lang} ({String(count)})
                        </motion.span>
                      ))}
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-xs text-[var(--text-muted)] font-mono tracking-widest uppercase py-4 border border-dashed border-[var(--border-color)] w-full rounded-xl text-center"
                  style={{ backgroundColor: 'rgba(10, 10, 18, 0.2)' }}
                >
                  // SCAN DIRECTORY TO LOAD //
                </motion.div>
              )}
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
};
