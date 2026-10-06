import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { FlowGraphView } from '../components/graph/FlowGraphView';
import {
  Play,
  Share2,
  Loader2,
  AlertTriangle,
  X,
  LayoutGrid,
  Search,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
  SlidersHorizontal,
  ExternalLink,
  MessageSquare,
  ArrowRight,
  ArrowLeft,
  Layers,
  FileCode,
  Info,
  CheckCircle2,
  ChevronRight,
} from 'lucide-react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { colors, radius, font } from '../design-system/tokens';
import { Tooltip, Badge, Button, FilePath } from '../design-system/primitives';
import { ErrorCard } from '../components/ErrorCard';

type GraphFilterType = 'all' | 'high_connectivity' | 'circular' | 'selected_deps' | 'direct_deps';

const drawerVariants: Variants = {
  hidden: { x: 340, opacity: 0 },
  visible: {
    x: 0,
    opacity: 1,
    transition: { type: 'spring', stiffness: 300, damping: 30 },
  },
  exit: {
    x: 340,
    opacity: 0,
    transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] as const },
  },
};

/** Formats relative path from repository root */
function getRelativePath(fullPath: string, rootPath: string): string {
  const normRoot = rootPath.replace(/\\/g, '/').replace(/\/+$/, '');
  const normFile = fullPath.replace(/\\/g, '/');
  if (normRoot && normFile.startsWith(normRoot)) {
    return normFile.slice(normRoot.length).replace(/^\/+/, '');
  }
  return normFile;
}

export const DependencyGraph: React.FC = () => {
  const navigate = useNavigate();
  const repoPath = useWorkspaceStore((s) => s.activeRepository) || '';
  const loading = useWorkspaceStore((s) => s.graphLoading);
  const error = useWorkspaceStore((s) => s.graphError);
  const graphData = useWorkspaceStore((s) => s.graphData);
  const analysisResult = useWorkspaceStore((s) => s.analysisResult);
  const fetchGraph = useWorkspaceStore((s) => s.fetchGraph);
  const runAnalysis = useWorkspaceStore((s) => s.runAnalysis);
  const setSelectedFile = useWorkspaceStore((s) => s.setSelectedFile);

  // View state
  const [activeType, setActiveType] = useState<'dependency' | 'call' | 'symbol'>('dependency');
  const [layoutName, setLayoutName] = useState<'cose' | 'dagre' | 'circle'>('cose');
  const [graphFilter, setGraphFilter] = useState<GraphFilterType>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedNode, setSelectedNode] = useState<any | null>(null);

  // Change Impact Analysis State (Feature 2)
  const [impactResult, setImpactResult] = useState<any | null>(null);
  const [impactLoading, setImpactLoading] = useState(false);

  useEffect(() => {
    if (repoPath) {
      fetchGraph(activeType);
    }
  }, [repoPath, activeType]);

  // Fetch change impact when a node is selected
  useEffect(() => {
    let isCurrent = true;
    if (selectedNode && repoPath) {
      const targetPath = selectedNode.file_path || selectedNode.id;
      setImpactLoading(true);
      import('../services/graph')
        .then((svc) => svc.getChangeImpact(repoPath, targetPath))
        .then((res) => {
          if (isCurrent) setImpactResult(res);
        })
        .catch(() => {
          if (isCurrent) setImpactResult(null);
        })
        .finally(() => {
          if (isCurrent) setImpactLoading(false);
        });
    } else {
      setImpactResult(null);
    }
    return () => {
      isCurrent = false;
    };
  }, [selectedNode, repoPath]);

  const handleRunAnalysis = () => {
    runAnalysis();
  };

  // Inspect relationships of selected node
  const nodeRelationships = useMemo(() => {
    if (!selectedNode || !graphData) {
      return { dependsOn: [], usedBy: [], totalIn: 0, totalOut: 0 };
    }

    const nodeId = selectedNode.id;
    const rawEdges: any[] = [];

    if (Array.isArray(graphData)) {
      graphData.forEach((el: any) => {
        if (el.data?.source && el.data?.target) rawEdges.push(el.data);
      });
    } else if (graphData.edges) {
      rawEdges.push(...(Array.isArray(graphData.edges) ? graphData.edges.map((e: any) => e.data || e) : []));
    } else if (graphData.elements) {
      graphData.elements.forEach((el: any) => {
        if (el.data?.source && el.data?.target) rawEdges.push(el.data);
      });
    }

    // Depends on (outgoing from nodeId)
    const dependsOn = rawEdges
      .filter((e) => e.source === nodeId)
      .map((e) => ({
        target: e.target,
        type: e.edge_type || 'imports',
      }));

    // Used by (incoming to nodeId)
    const usedBy = rawEdges
      .filter((e) => e.target === nodeId)
      .map((e) => ({
        source: e.source,
        type: e.edge_type || 'imported by',
      }));

    return {
      dependsOn,
      usedBy,
      totalOut: dependsOn.length,
      totalIn: usedBy.length,
    };
  }, [selectedNode, graphData]);

  // Actions
  const handleOpenFile = (path: string) => {
    setSelectedFile(path);
    navigate('/explorer');
  };

  const handleAskAI = (nodeLabel: string, filePath: string) => {
    navigate('/chat');
    setTimeout(() => {
      const store = useWorkspaceStore.getState();
      const rel = getRelativePath(filePath || nodeLabel, repoPath);
      store.sendChatMessage(
        `Explain how ${nodeLabel} is used in ${rel} and detail its incoming and outgoing relationships.`
      );
    }, 100);
  };

  const handleReset = () => {
    setSearchQuery('');
    setGraphFilter('all');
    setSelectedNode(null);
    setLayoutName('cose');
  };

  const isDrawerOpen = selectedNode || analysisResult;

  const currentTitle =
    activeType === 'dependency'
      ? 'How Files Connect'
      : activeType === 'call'
      ? 'Who Calls What?'
      : 'Symbol Relationships';
  const currentTechBadge =
    activeType === 'dependency'
      ? 'Dependency Graph'
      : activeType === 'call'
      ? 'Call Graph'
      : 'Symbol Graph';
  const currentExplanation =
    activeType === 'dependency'
      ? 'This map shows which parts of your project depend on one another.'
      : activeType === 'call'
      ? 'Visualizes execution flow and function-to-function invocation paths.'
      : 'Traces DEFINES, IMPORTS, CALLS, INHERITS, and USES relationships across codebase symbols.';

  return (
    <div
      className="flex-1 flex overflow-hidden w-full h-full relative select-none"
      style={{ backgroundColor: colors.bg.primary }}
    >
      {/* ── Main Viewport & Controls ── */}
      <div className="flex-grow flex flex-col overflow-hidden h-full relative">
        {/* Top Control Bar */}
        <div
          style={{
            padding: '10px 16px',
            borderBottom: `1px solid ${colors.border.default}`,
            backgroundColor: colors.bg.surface,
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            flexShrink: 0,
          }}
        >
          {/* Row 1: Title & Mode Tabs */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: colors.accent.blue, display: 'flex', alignItems: 'center' }}>
                <Share2 size={16} />
              </span>
              <h1
                style={{
                  fontSize: font.size.sm,
                  fontWeight: 600,
                  color: colors.text.primary,
                  fontFamily: font.sans,
                  margin: 0,
                }}
              >
                {currentTitle}
              </h1>
              <Tooltip content="Graph representation of module imports and function invocation edges extracted from AST.">
                <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <Badge variant="default">{currentTechBadge}</Badge>
                </span>
              </Tooltip>
              <span style={{ fontSize: '11px', color: colors.text.muted, marginLeft: '4px' }}>
                {currentExplanation}
              </span>
            </div>

            {/* Segmented Mode Switcher */}
            <div
              style={{
                display: 'flex',
                padding: '2px',
                borderRadius: radius.md,
                backgroundColor: colors.bg.primary,
                border: `1px solid ${colors.border.default}`,
              }}
            >
              <button
                onClick={() => {
                  setActiveType('dependency');
                  setSelectedNode(null);
                }}
                style={{
                  fontSize: '11px',
                  fontWeight: activeType === 'dependency' ? 600 : 400,
                  fontFamily: font.sans,
                  padding: '4px 10px',
                  borderRadius: radius.sm,
                  backgroundColor: activeType === 'dependency' ? colors.bg.surfaceSecondary : 'transparent',
                  color: activeType === 'dependency' ? colors.text.primary : colors.text.muted,
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'background-color 0.1s ease',
                }}
              >
                How Files Connect
              </button>
              <button
                onClick={() => {
                  setActiveType('call');
                  setSelectedNode(null);
                }}
                style={{
                  fontSize: '11px',
                  fontWeight: activeType === 'call' ? 600 : 400,
                  fontFamily: font.sans,
                  padding: '4px 10px',
                  borderRadius: radius.sm,
                  backgroundColor: activeType === 'call' ? colors.bg.surfaceSecondary : 'transparent',
                  color: activeType === 'call' ? colors.text.primary : colors.text.muted,
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'background-color 0.1s ease',
                }}
              >
                Who Calls What?
              </button>
              <button
                onClick={() => {
                  setActiveType('symbol');
                  setSelectedNode(null);
                }}
                style={{
                  fontSize: '11px',
                  fontWeight: activeType === 'symbol' ? 600 : 400,
                  fontFamily: font.sans,
                  padding: '4px 10px',
                  borderRadius: radius.sm,
                  backgroundColor: activeType === 'symbol' ? colors.bg.surfaceSecondary : 'transparent',
                  color: activeType === 'symbol' ? colors.text.primary : colors.text.muted,
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'background-color 0.1s ease',
                }}
              >
                Symbol Graph
              </button>
            </div>
          </div>

          {/* Row 2: Search, Filters, Layout & Reset Controls */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, maxWidth: '640px' }}>
              {/* Search in Graph */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 8px',
                  backgroundColor: colors.bg.primary,
                  border: `1px solid ${colors.border.default}`,
                  borderRadius: radius.md,
                  flex: 1,
                  maxWidth: '260px',
                }}
              >
                <Search size={12} style={{ color: colors.text.muted }} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search nodes in graph..."
                  style={{
                    width: '100%',
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    fontSize: '11px',
                    color: colors.text.primary,
                    fontFamily: font.sans,
                  }}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    style={{ background: 'none', border: 'none', color: colors.text.muted, cursor: 'pointer', padding: 0 }}
                  >
                    <X size={11} />
                  </button>
                )}
              </div>

              {/* Filtering dropdown */}
              <Tooltip content="Filter which nodes and edges are visible in the graph view.">
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <SlidersHorizontal size={12} style={{ color: colors.text.muted }} />
                  <select
                    value={graphFilter}
                    onChange={(e: any) => setGraphFilter(e.target.value)}
                    style={{
                      fontSize: '11px',
                      fontFamily: font.sans,
                      padding: '4px 8px',
                      borderRadius: radius.md,
                      backgroundColor: colors.bg.primary,
                      border: `1px solid ${colors.border.default}`,
                      color: colors.text.primary,
                      outline: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="all">Filter: All Nodes</option>
                    <option value="high_connectivity">High Connectivity (3+ links)</option>
                    <option value="direct_deps">Direct Dependencies Only</option>
                  </select>
                </div>
              </Tooltip>

              {/* Layout Selector */}
              <Tooltip content="Graph layout: Force-directed simulates organic springs, Hierarchical arranges layers, Radial arranges in a circle.">
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <LayoutGrid size={12} style={{ color: colors.text.muted }} />
                  <select
                    value={layoutName}
                    onChange={(e: any) => setLayoutName(e.target.value)}
                    style={{
                      fontSize: '11px',
                      fontFamily: font.sans,
                      padding: '4px 8px',
                      borderRadius: radius.md,
                      backgroundColor: colors.bg.primary,
                      border: `1px solid ${colors.border.default}`,
                      color: colors.text.primary,
                      outline: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="cose">Force-Directed</option>
                    <option value="dagre">Hierarchical</option>
                    <option value="circle">Radial</option>
                  </select>
                </div>
              </Tooltip>

              {/* Reset view */}
              <Tooltip content="Reset search query, filters, and layout settings.">
                <button
                  onClick={handleReset}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '11px',
                    fontFamily: font.sans,
                    padding: '4px 8px',
                    borderRadius: radius.md,
                    backgroundColor: colors.bg.primary,
                    border: `1px solid ${colors.border.default}`,
                    color: colors.text.secondary,
                    cursor: 'pointer',
                  }}
                >
                  <RotateCcw size={11} />
                  Reset
                </button>
              </Tooltip>
            </div>

            {/* Run Analysis Action */}
            <Tooltip content="Detects unreferenced dead code, circular dependencies, and risk hotspots.">
              <span>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleRunAnalysis}
                  disabled={loading || !repoPath}
                  icon={<Play size={11} />}
                >
                  Analyze Structure
                </Button>
              </span>
            </Tooltip>
          </div>
        </div>

        {/* Viewport Canvas */}
        <div className="flex-1 w-full overflow-hidden relative" style={{ backgroundColor: colors.bg.primary }}>
          <AnimatePresence>
            {error && (
              <div className="absolute top-4 left-4 right-4 z-50 max-w-xl">
                <ErrorCard
                  title="Graph Construction Failed"
                  whatHappened={error}
                  why="Failed to build topological dependency and call graphs for the codebase."
                  whatCanIDo={[
                    'Verify the repository files are valid syntax and parseable.',
                    'Check backend service connectivity.',
                    'Retry building the graph.',
                  ]}
                  onRetry={() => fetchGraph(activeType)}
                  retrying={loading}
                />
              </div>
            )}
          </AnimatePresence>

          {loading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10" style={{ backgroundColor: colors.bg.primary }}>
              <Loader2 size={32} className="animate-spin" style={{ color: colors.accent.blue }} />
              <span style={{ fontSize: font.size.sm, color: colors.text.secondary, fontFamily: font.sans }}>
                Building graph relationships from syntax tree...
              </span>
            </div>
          ) : graphData && (graphData.elements?.length > 0 || graphData.nodes?.length > 0 || graphData.length > 0) ? (
            <FlowGraphView
              graphData={graphData}
              onNodeClick={setSelectedNode}
              selectedNodeId={selectedNode?.id || null}
              searchFilter={searchQuery}
              graphFilter={graphFilter}
              layoutType={layoutName}
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center p-8">
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: radius.lg,
                  backgroundColor: colors.bg.surfaceSecondary,
                  border: `1px solid ${colors.border.default}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: colors.text.muted,
                }}
              >
                <Share2 size={20} />
              </div>
              <div className="max-w-xs flex flex-col gap-1">
                <h3 style={{ fontSize: font.size.sm, fontWeight: 600, color: colors.text.primary }}>
                  No Active Graph Data
                </h3>
                <p style={{ fontSize: '12px', color: colors.text.muted }}>
                  Select or scan a repository in the Explorer view to trace dependencies.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Right Slide-out Drawer: Node Inspector & Analysis Results ── */}
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
              width: '340px',
              minWidth: '340px',
              backgroundColor: colors.bg.surface,
              borderColor: colors.border.default,
            }}
          >
            <div className="flex-1 flex flex-col overflow-y-auto p-4 gap-4 scrollbar-thin">
              {/* Option A: Selected Node Inspector */}
              {selectedNode ? (
                <div className="flex flex-col gap-4">
                  <div
                    className="flex items-center justify-between border-b pb-2"
                    style={{ borderColor: colors.border.default }}
                  >
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        color: colors.text.muted,
                      }}
                    >
                      Selected Node Inspector
                    </span>
                    <button
                      onClick={() => setSelectedNode(null)}
                      style={{ background: 'none', border: 'none', color: colors.text.muted, cursor: 'pointer', padding: '2px' }}
                      title="Close inspector"
                    >
                      <X size={14} />
                    </button>
                  </div>

                  {/* Node Identity */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <FileCode size={14} style={{ color: colors.accent.blue }} />
                      <span
                        style={{
                          fontSize: font.size.sm,
                          fontWeight: 600,
                          fontFamily: font.mono,
                          color: colors.text.primary,
                        }}
                      >
                        {selectedNode.label || selectedNode.id}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                      <Badge variant="default">{selectedNode.node_type || 'file'}</Badge>
                      <span style={{ fontSize: '11px', color: colors.text.muted, fontFamily: font.mono }}>
                        {nodeRelationships.totalIn} callers • {nodeRelationships.totalOut} imports
                      </span>
                    </div>

                    {selectedNode.file_path && (
                      <div style={{ marginTop: '4px' }}>
                        <FilePath path={getRelativePath(selectedNode.file_path, repoPath)} />
                      </div>
                    )}
                  </div>

                  {/* Summary Metric Pills */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div
                      style={{
                        padding: '8px 10px',
                        borderRadius: radius.md,
                        backgroundColor: colors.bg.surfaceSecondary,
                        border: `1px solid ${colors.border.subtle}`,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px',
                      }}
                    >
                      <span style={{ fontSize: '10px', color: colors.text.muted, textTransform: 'uppercase' }}>
                        Imports
                      </span>
                      <span style={{ fontSize: font.size.lg, fontWeight: 700, color: colors.text.primary, fontFamily: font.mono }}>
                        {nodeRelationships.totalOut}
                      </span>
                      <span style={{ fontSize: '10px', color: colors.text.secondary }}>
                        outgoing deps
                      </span>
                    </div>

                    <div
                      style={{
                        padding: '8px 10px',
                        borderRadius: radius.md,
                        backgroundColor: colors.bg.surfaceSecondary,
                        border: `1px solid ${colors.border.subtle}`,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px',
                      }}
                    >
                      <span style={{ fontSize: '10px', color: colors.text.muted, textTransform: 'uppercase' }}>
                        Imported by
                      </span>
                      <span style={{ fontSize: font.size.lg, fontWeight: 700, color: colors.text.primary, fontFamily: font.mono }}>
                        {nodeRelationships.totalIn}
                      </span>
                      <span style={{ fontSize: '10px', color: colors.text.secondary }}>
                        inbound callers
                      </span>
                    </div>
                  </div>

                  {/* Depends on (Outgoing dependencies) */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Depends on ({nodeRelationships.totalOut})
                    </span>
                    {nodeRelationships.dependsOn.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '120px', overflowY: 'auto' }}>
                        {nodeRelationships.dependsOn.map((dep, dIdx) => (
                          <div
                            key={dIdx}
                            style={{
                              padding: '4px 8px',
                              borderRadius: radius.sm,
                              backgroundColor: colors.bg.surfaceSecondary,
                              border: `1px solid ${colors.border.subtle}`,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              fontSize: '11px',
                              fontFamily: font.mono,
                            }}
                          >
                            <span style={{ color: colors.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {getRelativePath(dep.target, repoPath)}
                            </span>
                            <span style={{ color: colors.text.muted, fontSize: '9px' }}>
                              {dep.type}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span style={{ fontSize: '11px', color: colors.text.muted, fontStyle: 'italic' }}>
                        No outgoing dependencies.
                      </span>
                    )}
                  </div>

                  {/* Used by (Inbound callers) */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Used by ({nodeRelationships.totalIn})
                    </span>
                    {nodeRelationships.usedBy.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '120px', overflowY: 'auto' }}>
                        {nodeRelationships.usedBy.map((caller, cIdx) => (
                          <div
                            key={cIdx}
                            style={{
                              padding: '4px 8px',
                              borderRadius: radius.sm,
                              backgroundColor: colors.bg.surfaceSecondary,
                              border: `1px solid ${colors.border.subtle}`,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              fontSize: '11px',
                              fontFamily: font.mono,
                            }}
                          >
                            <span style={{ color: colors.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {getRelativePath(caller.source, repoPath)}
                            </span>
                            <span style={{ color: colors.text.muted, fontSize: '9px' }}>
                              {caller.type}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span style={{ fontSize: '11px', color: colors.text.muted, fontStyle: 'italic' }}>
                        No known incoming callers.
                      </span>
                    )}
                  </div>

                  {/* Change Impact Analysis (Feature 2) */}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      padding: '10px 12px',
                      borderRadius: radius.md,
                      backgroundColor: colors.bg.surfaceSecondary,
                      border: `1px solid ${colors.border.subtle}`,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Layers size={13} style={{ color: colors.accent.blue }} />
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            color: colors.text.secondary,
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                          }}
                        >
                          Change Impact Analysis
                        </span>
                      </div>
                      {impactLoading ? (
                        <Loader2 size={12} style={{ animation: 'ds-spin 1s linear infinite', color: colors.text.muted }} />
                      ) : impactResult ? (
                        <Badge
                          variant={
                            impactResult.risk_level === 'High'
                              ? 'red'
                              : impactResult.risk_level === 'Medium'
                              ? 'yellow'
                              : 'green'
                          }
                        >
                          {impactResult.risk_level} Risk
                        </Badge>
                      ) : null}
                    </div>

                    {impactLoading ? (
                      <span style={{ fontSize: '11px', color: colors.text.muted, fontStyle: 'italic' }}>
                        Calculating dependency blast radius...
                      </span>
                    ) : impactResult ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              padding: '4px 6px',
                              background: colors.bg.primary,
                              borderRadius: radius.sm,
                            }}
                          >
                            <span style={{ fontSize: '10px', color: colors.text.muted }}>Direct Dependents</span>
                            <span
                              style={{
                                fontSize: '12px',
                                fontWeight: 600,
                                fontFamily: font.mono,
                                color: colors.text.primary,
                              }}
                            >
                              {impactResult.direct_dependents_count}
                            </span>
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              padding: '4px 6px',
                              background: colors.bg.primary,
                              borderRadius: radius.sm,
                            }}
                          >
                            <span style={{ fontSize: '10px', color: colors.text.muted }}>Indirect Dependents</span>
                            <span
                              style={{
                                fontSize: '12px',
                                fontWeight: 600,
                                fontFamily: font.mono,
                                color: colors.text.primary,
                              }}
                            >
                              {impactResult.indirect_dependents_count}
                            </span>
                          </div>
                        </div>

                        <p style={{ fontSize: '11px', color: colors.text.secondary, margin: 0, lineHeight: 1.4 }}>
                          {impactResult.explanation}
                        </p>

                        {impactResult.most_affected && impactResult.most_affected.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                            <span
                              style={{
                                fontSize: '10px',
                                fontWeight: 600,
                                color: colors.text.muted,
                                textTransform: 'uppercase',
                              }}
                            >
                              Most Affected Files
                            </span>
                            <div
                              style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '4px',
                                maxHeight: '100px',
                                overflowY: 'auto',
                              }}
                            >
                              {impactResult.most_affected.map((affFile: string, afIdx: number) => (
                                <div
                                  key={afIdx}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '3px 6px',
                                    borderRadius: radius.sm,
                                    background: colors.bg.primary,
                                    fontSize: '11px',
                                    fontFamily: font.mono,
                                  }}
                                >
                                  <span
                                    style={{
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                      maxWidth: '170px',
                                      color: colors.text.primary,
                                    }}
                                    title={affFile}
                                  >
                                    {getRelativePath(affFile, repoPath)}
                                  </span>
                                  <button
                                    onClick={() => handleOpenFile(affFile)}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      color: colors.accent.blue,
                                      cursor: 'pointer',
                                      fontSize: '10px',
                                      padding: '1px 4px',
                                    }}
                                  >
                                    Inspect
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <span style={{ fontSize: '11px', color: colors.text.muted, fontStyle: 'italic' }}>
                        Select a file or symbol to analyze change impact.
                      </span>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingTop: '8px', borderTop: `1px solid ${colors.border.subtle}` }}>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleOpenFile(selectedNode.file_path || selectedNode.id)}
                      icon={<ExternalLink size={12} />}
                    >
                      Open file in Explorer
                    </Button>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setGraphFilter('direct_deps')}
                        icon={<ArrowRight size={11} />}
                      >
                        View dependencies
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleAskAI(selectedNode.label, selectedNode.file_path || selectedNode.id)}
                        icon={<MessageSquare size={11} />}
                      >
                        Ask AI
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Option B: Structural Analysis Report */}
              {analysisResult && (
                <div className="flex flex-col gap-3" style={{ marginTop: selectedNode ? '16px' : '0' }}>
                  <div
                    className="flex items-center justify-between border-b pb-2"
                    style={{ borderColor: colors.border.default }}
                  >
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        color: colors.text.muted,
                      }}
                    >
                      Architecture Analysis
                    </span>
                    {!selectedNode && (
                      <button
                        onClick={() => useWorkspaceStore.setState({ analysisResult: null })}
                        style={{ background: 'none', border: 'none', color: colors.text.muted, cursor: 'pointer', padding: '2px' }}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {/* Circular Dependencies */}
                  <div className="flex flex-col gap-1">
                    <span style={{ fontSize: '12px', fontWeight: 500, color: colors.text.primary }}>
                      Circular Dependencies
                    </span>
                    {analysisResult.circular_dependencies && analysisResult.circular_dependencies.length > 0 ? (
                      <div className="flex flex-col gap-1">
                        {analysisResult.circular_dependencies.map((cycle: string[], cIdx: number) => (
                          <div
                            key={cIdx}
                            style={{
                              padding: '6px 8px',
                              borderRadius: radius.sm,
                              backgroundColor: 'rgba(201, 90, 90, 0.08)',
                              border: `1px solid ${colors.status.dangerBorder}`,
                              color: colors.status.danger,
                              fontSize: '11px',
                              fontFamily: font.mono,
                            }}
                          >
                            {cycle.map((p) => getRelativePath(p, repoPath)).join(' → ')}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span style={{ fontSize: '11px', color: colors.status.success, display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <CheckCircle2 size={12} /> No circular dependency loops detected.
                      </span>
                    )}
                  </div>

                  {/* Dead Code with calibrated confidence (Feature 3) */}
                  <div className="flex flex-col gap-1 mt-2">
                    <span style={{ fontSize: '12px', fontWeight: 500, color: colors.text.primary }}>
                      Potentially Unreferenced Code
                    </span>
                    {analysisResult.dead_code_confidence && analysisResult.dead_code_confidence.length > 0 ? (
                      <div className="flex flex-col gap-2">
                        {analysisResult.dead_code_confidence.slice(0, 8).map((dcItem: any, dIdx: number) => (
                          <div
                            key={dIdx}
                            style={{
                              padding: '6px 8px',
                              borderRadius: radius.sm,
                              backgroundColor: colors.bg.surfaceSecondary,
                              border: `1px solid ${colors.border.subtle}`,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '4px',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: '11px', fontWeight: 600, fontFamily: font.mono, color: colors.text.primary }}>
                                {dcItem.node?.label || dcItem.node?.id}
                              </span>
                              <Badge variant={dcItem.confidence >= 90 ? 'yellow' : 'default'}>
                                {dcItem.confidence}% confidence
                              </Badge>
                            </div>
                            <span style={{ fontSize: '10px', color: colors.text.muted }}>
                              {dcItem.reason || 'No references found across indexed repository.'}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px' }}>
                              <span style={{ fontSize: '10px', color: colors.text.muted, fontStyle: 'italic' }}>
                                {dcItem.status || 'Potentially unused'}
                              </span>
                              {dcItem.node?.file_path && (
                                <button
                                  onClick={() => handleOpenFile(dcItem.node.file_path)}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    color: colors.accent.blue,
                                    cursor: 'pointer',
                                    fontSize: '10px',
                                    padding: 0,
                                  }}
                                >
                                  Inspect file
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : analysisResult.dead_code && analysisResult.dead_code.length > 0 ? (
                      <div className="flex flex-col gap-1">
                        {analysisResult.dead_code.slice(0, 8).map((dc: any, dIdx: number) => (
                          <span
                            key={dIdx}
                            style={{
                              padding: '3px 6px',
                              borderRadius: radius.sm,
                              backgroundColor: colors.bg.surfaceSecondary,
                              color: colors.text.secondary,
                              fontSize: '11px',
                              fontFamily: font.mono,
                            }}
                          >
                            {dc.label || dc.id}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span style={{ fontSize: '11px', color: colors.status.success, display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <CheckCircle2 size={12} /> All identified symbols have active references.
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
