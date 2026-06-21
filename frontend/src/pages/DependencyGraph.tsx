import React, { useEffect, useState } from 'react';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { FlowGraphView } from '../components/graph/FlowGraphView';
import {
  Play,
  Share2,
  Loader2,
  AlertTriangle,
  AlertCircle,
  Sparkles,
  X,
  LayoutGrid,
} from 'lucide-react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';

const drawerVariants: Variants = {
  hidden: { x: 320, opacity: 0 },
  visible: {
    x: 0,
    opacity: 1,
    transition: { type: 'spring', stiffness: 300, damping: 30 },
  },
  exit: {
    x: 320,
    opacity: 0,
    transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] as const },
  },
};

export const DependencyGraph: React.FC = () => {
  const repoPath = useWorkspaceStore((s) => s.activeRepository) || '';
  const loading = useWorkspaceStore((s) => s.graphLoading);
  const error = useWorkspaceStore((s) => s.graphError);
  const graphData = useWorkspaceStore((s) => s.graphData);
  const analysisResult = useWorkspaceStore((s) => s.analysisResult);
  const fetchGraph = useWorkspaceStore((s) => s.fetchGraph);
  const runAnalysis = useWorkspaceStore((s) => s.runAnalysis);

  const [activeType, setActiveType] = useState<'dependency' | 'call'>('dependency');
  const [layoutName, setLayoutName] = useState<'cose' | 'dagre' | 'circle'>('cose');
  const [selectedNode, setSelectedNode] = useState<any | null>(null);

  useEffect(() => {
    if (repoPath) {
      fetchGraph(activeType);
    }
  }, [repoPath, activeType]);

  const handleRunAnalysis = () => {
    runAnalysis();
  };

  const isDrawerOpen = selectedNode || analysisResult;

  return (
    <div className="flex-1 flex overflow-hidden w-full h-full relative">
      {/* ── Main Viewport & Toolbar ── */}
      <div className="flex-grow flex flex-col overflow-hidden h-full relative">
        {/* Toolbar Header */}
        <div className="page-header flex-wrap gap-4">
          {/* Left: Graph Type Segmented Control + Layout */}
          <div className="flex items-center gap-3">
            {/* Segmented Control */}
            <div
              className="glass-panel-subtle flex p-0.5 !rounded-lg"
            >
              <button
                onClick={() => setActiveType('dependency')}
                className="text-xs px-3.5 py-1.5 rounded-md font-semibold transition-all duration-200 relative"
                style={{
                  backgroundColor: activeType === 'dependency' ? 'var(--bg-surface)' : 'transparent',
                  color: activeType === 'dependency' ? 'var(--text-primary)' : 'var(--text-muted)',
                  boxShadow: activeType === 'dependency' ? '0 0 12px rgba(96, 165, 250, 0.1)' : 'none',
                }}
              >
                Dependency Map
              </button>
              <button
                onClick={() => setActiveType('call')}
                className="text-xs px-3.5 py-1.5 rounded-md font-semibold transition-all duration-200 relative"
                style={{
                  backgroundColor: activeType === 'call' ? 'var(--bg-surface)' : 'transparent',
                  color: activeType === 'call' ? 'var(--text-primary)' : 'var(--text-muted)',
                  boxShadow: activeType === 'call' ? '0 0 12px rgba(96, 165, 250, 0.1)' : 'none',
                }}
              >
                Call Graph
              </button>
            </div>

            {/* Layout Selector */}
            <div className="flex items-center gap-1.5">
              <LayoutGrid size={12} className="text-[var(--text-muted)]" />
              <select
                value={layoutName}
                onChange={(e: any) => setLayoutName(e.target.value)}
                className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer outline-none"
                style={{
                  backgroundColor: 'var(--bg-primary)',
                  borderColor: 'var(--border-color)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)',
                }}
              >
                <option value="cose">Force Directed (Cose)</option>
                <option value="dagre">Hierarchical (Dagre)</option>
                <option value="circle">Radial (Circle)</option>
              </select>
            </div>
          </div>

          {/* Right: Compute Analytics */}
          <button
            onClick={handleRunAnalysis}
            disabled={loading || !repoPath}
            className="btn-primary !py-2 !px-4 !text-xs"
          >
            <Play size={12} />
            <span>Compute Analytics</span>
          </button>
        </div>

        {/* Viewport Canvas */}
        <div className="flex-1 w-full overflow-hidden relative">
          {/* Error overlay */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute top-4 left-4 right-4 z-50 glass-panel-subtle p-3 flex items-center gap-3 text-xs"
                style={{
                  borderColor: 'rgba(251, 113, 133, 0.2)',
                  background: 'rgba(251, 113, 133, 0.05)',
                  color: 'var(--accent-rose)',
                }}
              >
                <AlertTriangle size={16} />
                <span>{error}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {loading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[var(--bg-primary)] z-10">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              >
                <Loader2 size={36} className="text-[var(--accent-primary)]" />
              </motion.div>
              <span className="text-sm font-semibold font-mono text-[var(--text-secondary)]">
                Plotting vector-linked code nodes ...
              </span>
            </div>
          ) : graphData && (graphData.elements?.length > 0 || graphData.nodes?.length > 0 || graphData.length > 0) ? (
            <FlowGraphView
              graphData={graphData}
              onNodeClick={setSelectedNode}
            />
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4 }}
              className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center p-8"
            >
              <div className="glass-panel w-14 h-14 !rounded-xl flex items-center justify-center text-[var(--text-muted)]">
                <Share2 size={24} />
              </div>
              <div className="max-w-xs flex flex-col gap-1.5">
                <h3 className="text-sm font-bold text-[var(--text-primary)]">
                  No Active Graph
                </h3>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                  Scan a repository in the Explorer view to visualize dependency and call graphs here.
                </p>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* ── Right Slide-out Drawer ── */}
      <AnimatePresence>
        {isDrawerOpen && (
          <motion.div
            key="drawer"
            variants={drawerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="flex flex-col border-l h-full overflow-hidden shadow-2xl relative select-none"
            style={{
              width: '320px',
              minWidth: '320px',
              backgroundColor: 'var(--bg-secondary)',
              borderColor: 'var(--border-color)',
            }}
          >
            <div className="flex-1 flex flex-col overflow-y-auto p-4 gap-5 scrollbar-thin">
              {/* Option A: Node Inspector */}
              {selectedNode ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.1 }}
                  className="flex flex-col gap-4"
                >
                  <div
                    className="flex items-center justify-between border-b pb-3"
                    style={{ borderColor: 'var(--border-color)' }}
                  >
                    <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                      Node Inspector
                    </span>
                    <button
                      onClick={() => setSelectedNode(null)}
                      className="btn-ghost !p-1"
                    >
                      <X size={14} />
                    </button>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <h2 className="text-base font-bold font-mono truncate text-[var(--text-primary)]">
                      {selectedNode.label}
                    </h2>
                    <span
                      className={`badge ${
                        selectedNode.node_type === 'file'
                          ? 'badge-blue'
                          : selectedNode.node_type === 'class'
                          ? 'badge-purple'
                          : 'badge-green'
                      } w-fit`}
                    >
                      {selectedNode.node_type}
                    </span>
                  </div>

                  <div
                    className="flex flex-col gap-3 font-mono text-xs text-[var(--text-secondary)] border-t pt-4"
                    style={{ borderColor: 'var(--border-color)' }}
                  >
                    <div>
                      <span className="text-[var(--text-muted)] block mb-1">File Path:</span>
                      <span
                        className="break-all p-2 rounded-lg block select-text"
                        style={{ background: 'var(--bg-primary)' }}
                      >
                        {selectedNode.file_path || 'unknown'}
                      </span>
                    </div>

                    {selectedNode.metadata && (
                      <div className="flex flex-col gap-2">
                        <span className="text-[var(--text-muted)] block">AST Context:</span>
                        <div
                          className="flex flex-col gap-1.5 p-2.5 rounded-lg text-[11px] leading-relaxed"
                          style={{ background: 'var(--bg-primary)' }}
                        >
                          {selectedNode.metadata.start_line && (
                            <div>Lines: {selectedNode.metadata.start_line} – {selectedNode.metadata.end_line}</div>
                          )}
                          {selectedNode.metadata.docstring && (
                            <div
                              className="italic border-t mt-1.5 pt-1.5 select-text"
                              style={{ borderColor: 'var(--border-color)' }}
                            >
                              "{selectedNode.metadata.docstring}"
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              ) : (
                /* Option B: Graph Intelligence */
                analysisResult && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.1 }}
                    className="flex flex-col gap-5"
                  >
                    <div
                      className="flex items-center justify-between border-b pb-3"
                      style={{ borderColor: 'var(--border-color)' }}
                    >
                      <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
                        <Sparkles size={14} className="text-[var(--accent-purple)]" />
                        <span>Graph Intelligence</span>
                      </span>
                      <button
                        onClick={handleRunAnalysis}
                        className="text-[10px] text-[var(--accent-primary)] hover:underline font-semibold"
                      >
                        Recalculate
                      </button>
                    </div>

                    {/* Stat Cards */}
                    <div className="grid grid-cols-2 gap-3 text-center">
                      <div className="stat-card !p-3">
                        <span className="text-[10px] text-[var(--text-muted)] block mb-0.5 uppercase tracking-wider font-bold">
                          Circular Deps
                        </span>
                        <span className="text-lg font-bold font-mono text-[var(--accent-rose)]">
                          {analysisResult.circular_dependencies?.length || 0}
                        </span>
                      </div>
                      <div className="stat-card !p-3">
                        <span className="text-[10px] text-[var(--text-muted)] block mb-0.5 uppercase tracking-wider font-bold">
                          Dead Entities
                        </span>
                        <span className="text-lg font-bold font-mono text-[var(--accent-yellow)]">
                          {analysisResult.dead_code?.length || 0}
                        </span>
                      </div>
                    </div>

                    {/* Circular Dependencies */}
                    <div className="flex flex-col gap-2.5">
                      <h3 className="text-xs font-semibold text-[var(--text-secondary)] flex items-center gap-1.5">
                        <AlertCircle size={14} className="text-[var(--accent-rose)]" />
                        <span>Circular Dependencies</span>
                      </h3>
                      {analysisResult.circular_dependencies && analysisResult.circular_dependencies.length > 0 ? (
                        <div className="flex flex-col gap-2 max-h-[140px] overflow-y-auto scrollbar-thin">
                          {analysisResult.circular_dependencies.map((cycle, idx) => (
                            <motion.div
                              key={idx}
                              initial={{ opacity: 0, x: 10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: idx * 0.05 }}
                              className="p-2 rounded-lg text-[10px] font-mono leading-relaxed"
                              style={{
                                background: 'rgba(251, 113, 133, 0.05)',
                                border: '1px solid rgba(251, 113, 133, 0.15)',
                                color: 'var(--accent-rose)',
                              }}
                            >
                              {cycle.join(' → ')}
                            </motion.div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-[11px] text-[var(--text-muted)] italic leading-relaxed pl-1.5">
                          No circular imports found. Great code quality!
                        </div>
                      )}
                    </div>

                    {/* Dead Code */}
                    <div
                      className="flex flex-col gap-2.5 border-t pt-4"
                      style={{ borderColor: 'var(--border-color)' }}
                    >
                      <h3 className="text-xs font-semibold text-[var(--text-secondary)] flex items-center gap-1.5">
                        <AlertTriangle size={14} className="text-[var(--accent-yellow)]" />
                        <span>Dead Code Entities</span>
                      </h3>
                      {analysisResult.dead_code && analysisResult.dead_code.length > 0 ? (
                        <div className="flex flex-col gap-1.5 max-h-[180px] overflow-y-auto scrollbar-thin font-mono text-[10px]">
                          {analysisResult.dead_code.map((node, idx) => (
                            <motion.div
                              key={idx}
                              initial={{ opacity: 0, x: 10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: idx * 0.03 }}
                              className="flex items-center justify-between p-2 rounded-lg cursor-pointer truncate transition-all duration-200"
                              style={{
                                background: 'var(--bg-primary)',
                                border: '1px solid var(--border-color)',
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = 'var(--accent-yellow)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = 'var(--border-color)';
                              }}
                              onClick={() => setSelectedNode(node)}
                            >
                              <span className="truncate flex-1 text-[var(--text-secondary)]">
                                {node.label}
                              </span>
                              <span className="badge badge-yellow !text-[8px] ml-1.5">
                                {node.node_type}
                              </span>
                            </motion.div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-[11px] text-[var(--text-muted)] italic leading-relaxed pl-1.5">
                          No dead entities computed.
                        </div>
                      )}
                    </div>
                  </motion.div>
                )
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
