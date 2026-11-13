import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ChevronsDownUp, ChevronsUpDown, FolderClosed, FolderOpen } from 'lucide-react';
import { colors, font, radius } from '../../design-system/tokens';
import { buildGraphView, CLUSTER_PREFIX, parseGraphData, type GraphFilter } from './graphModel';
import { layoutGraphView, type LayoutType } from './graphLayout';

/* visual constants */

const TYPE_COLOR: Record<string, string> = {
  file: '#5B8DEF',
  module: '#5B8DEF',
  class: '#9580CA',
  function: '#4CAF79',
  method: '#C9943A',
  variable: '#7CC4C9',
  cluster: '#F2A93B',
};
const EDGE_COLOR: Record<string, string> = {
  imports: '#5B8DEF',
  calls: '#4CAF79',
  inherits: '#9580CA',
  defines: '#6F7887',
  uses: '#7CC4C9',
};
const DEFAULT_EDGE = '#6F7887';
const MAX_VISIBLE = 400;

type NodeState = 'normal' | 'active' | 'related' | 'dimmed';

interface ItemData {
  label: string;
  sublabel: string;
  nodeType: string;
  state: NodeState;
  match: boolean;
  [key: string]: unknown;
}
interface ClusterData extends ItemData {
  count: number;
  expanded: boolean;
}

const hiddenHandle: React.CSSProperties = { opacity: 0, width: 4, height: 4, border: 'none', minWidth: 0, minHeight: 0 };

function stateStyle(state: NodeState, accent: string, match: boolean): React.CSSProperties {
  return {
    opacity: state === 'dimmed' ? 0.22 : 1,
    borderColor: state === 'active' ? accent : match ? '#F2A93B' : colors.border.default,
    boxShadow: state === 'active' ? `0 0 0 3px ${accent}40` : match ? '0 0 0 2px rgba(242,169,59,0.35)' : 'none',
  };
}

function Handles({ vertical }: { vertical: boolean }) {
  return (
    <>
      <Handle type="target" position={vertical ? Position.Top : Position.Left} style={hiddenHandle} isConnectable={false} />
      <Handle type="source" position={vertical ? Position.Bottom : Position.Right} style={hiddenHandle} isConnectable={false} />
    </>
  );
}

const ItemNode = memo(function ItemNode({ data }: NodeProps) {
  const d = data as unknown as ItemData & { vertical: boolean };
  const accent = TYPE_COLOR[d.nodeType] ?? '#8A928B';
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        background: colors.bg.surface,
        border: '1px solid',
        borderRadius: radius.md,
        padding: '5px 10px 5px 12px',
        position: 'relative',
        overflow: 'hidden',
        fontFamily: font.mono,
        cursor: 'pointer',
        ...stateStyle(d.state, accent, d.match),
      }}
    >
      <Handles vertical={d.vertical} />
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: accent }} />
      <div
        style={{ fontSize: 11.5, fontWeight: 600, color: colors.text.primary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        title={d.label}
      >
        {d.label}
      </div>
      <div
        style={{ fontSize: 9.5, color: colors.text.secondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}
        title={d.sublabel}
      >
        <span style={{ color: accent, textTransform: 'uppercase', fontWeight: 700, marginRight: 6 }}>{d.nodeType}</span>
        {d.sublabel}
      </div>
    </div>
  );
});

const ClusterNode = memo(function ClusterNode({ data }: NodeProps) {
  const d = data as unknown as ClusterData & { vertical: boolean };
  const accent = TYPE_COLOR.cluster;
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        background: 'rgba(242, 169, 59, 0.06)',
        border: '1px dashed',
        borderRadius: radius.lg,
        padding: '7px 12px',
        fontFamily: font.sans,
        cursor: 'pointer',
        ...stateStyle(d.state, accent, d.match),
        borderColor: d.state === 'active' ? accent : 'rgba(242, 169, 59, 0.45)',
      }}
      title="Click to open this folder"
    >
      <Handles vertical={d.vertical} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: colors.text.primary }}>
        <FolderClosed size={13} color={accent} />
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.label}</span>
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 10.5,
            fontWeight: 700,
            color: '#151816',
            background: accent,
            borderRadius: 8,
            padding: '0 6px',
          }}
        >
          {d.count}
        </span>
      </div>
      <div style={{ fontSize: 10, color: colors.text.secondary, fontFamily: font.mono, marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {d.sublabel}
      </div>
    </div>
  );
});

const nodeTypes = { codeNode: ItemNode, clusterNode: ClusterNode };

/* props (unchanged public API) */

export interface FlowGraphViewProps {
  graphData: unknown;
  onNodeClick?: (node: { id: string; label: string; node_type: string; file_path: string; metadata: Record<string, unknown> }) => void;
  selectedNodeId?: string | null;
  searchFilter?: string;
  graphFilter?: GraphFilter;
  layoutType?: LayoutType;
}

const FlowGraphInner: React.FC<FlowGraphViewProps> = ({
  graphData,
  onNodeClick,
  selectedNodeId = null,
  searchFilter = '',
  graphFilter = 'all',
  layoutType = 'cose',
}) => {
  const { fitView } = useReactFlow();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [expandAll, setExpandAll] = useState(false);
  const [showNoise, setShowNoise] = useState(false);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const parsed = useMemo(() => parseGraphData(graphData), [graphData]);

  // Debounce search so typing does not re-layout on every key press.
  const [search, setSearch] = useState(searchFilter);
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchFilter), 250);
    return () => clearTimeout(t);
  }, [searchFilter]);

  // Only the "direct deps" filter depends on the selection; other filters must not re-layout on click.
  const focusSelection = graphFilter === 'direct_deps' || graphFilter === 'selected_deps' ? selectedNodeId : null;
  const view = useMemo(
    () =>
      buildGraphView(parsed, {
        expanded,
        filter: graphFilter,
        selectedId: focusSelection,
        search,
        expandAll: expandAll && parsed.nodes.length <= MAX_VISIBLE,
        maxVisible: MAX_VISIBLE,
        hideNoise: !showNoise,
      }),
    [parsed, expanded, graphFilter, focusSelection, search, expandAll, showNoise]
  );

  const vertical = layoutType !== 'dagre';
  const positions = useMemo(() => layoutGraphView(view, layoutType), [view, layoutType]);

  useEffect(() => {
    const t = setTimeout(() => fitView({ padding: 0.15, duration: 300 }), 40);
    return () => clearTimeout(t);
  }, [positions, fitView]);

  const focusId = hoverId ?? selectedNodeId;
  const neighbours = useMemo(() => {
    if (!focusId) return null;
    const set = new Set<string>([focusId]);
    view.edges.forEach((e) => {
      if (e.source === focusId) set.add(e.target);
      if (e.target === focusId) set.add(e.source);
    });
    return set;
  }, [focusId, view]);

  const nodes: Node[] = useMemo(
    () =>
      view.nodes.map((n) => {
        const p = positions.get(n.id)!;
        const state: NodeState = !neighbours
          ? 'normal'
          : n.id === focusId
            ? 'active'
            : neighbours.has(n.id)
              ? 'related'
              : 'dimmed';
        return {
          id: n.id,
          type: n.kind === 'cluster' ? 'clusterNode' : 'codeNode',
          position: { x: p.x, y: p.y },
          width: p.width,
          height: p.height,
          style: { width: p.width, height: p.height },
          draggable: false,
          data: {
            label: n.label,
            sublabel: n.sublabel,
            nodeType: n.nodeType,
            state,
            match: n.matches,
            count: n.count,
            expanded: false,
            vertical,
          },
        };
      }),
    [view, positions, neighbours, focusId, vertical]
  );

  const maxWeight = useMemo(() => Math.max(1, ...view.edges.map((e) => e.weight)), [view]);
  const edges: Edge[] = useMemo(
    () =>
      view.edges.map((e) => {
        const color = EDGE_COLOR[e.edgeType] ?? DEFAULT_EDGE;
        const touching = focusId != null && (e.source === focusId || e.target === focusId);
        const dim = focusId != null && !touching;
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          type: 'default',
          label: touching && e.weight > 1 ? `${e.weight}` : undefined,
          labelStyle: { fill: colors.text.primary, fontSize: 10, fontFamily: font.mono },
          labelBgStyle: { fill: colors.bg.primary, fillOpacity: 0.9 },
          style: {
            stroke: color,
            strokeWidth: touching ? 2.2 : 1 + (e.weight / maxWeight) * 1.6,
            opacity: dim ? 0.06 : touching ? 0.95 : 0.35,
          },
          markerEnd: { type: MarkerType.ArrowClosed, color, width: 12, height: 12 },
          zIndex: touching ? 5 : 0,
        };
      }),
    [view, focusId, maxWeight]
  );

  const toggleCluster = useCallback((clusterId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(clusterId)) next.delete(clusterId);
      else next.add(clusterId);
      return next;
    });
  }, []);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (node.type === 'clusterNode') {
        toggleCluster(node.id.slice(CLUSTER_PREFIX.length));
        return;
      }
      const raw = view.nodes.find((n) => n.id === node.id)?.raw;
      if (raw && onNodeClick) {
        onNodeClick({ id: raw.id, label: raw.label, node_type: raw.nodeType, file_path: raw.filePath, metadata: raw.metadata });
      }
    },
    [onNodeClick, toggleCluster, view]
  );

  const openFolders = [...expanded];
  const tooBigToExpandAll = parsed.nodes.length > MAX_VISIBLE;

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', backgroundColor: colors.bg.primary }}>
      <style>{CONTROLS_CSS}</style>
      {(view.isClustered || openFolders.length > 0 || view.truncated || view.hiddenNoise > 0 || showNoise) && (
        <div
          style={{
            position: 'absolute',
            top: 10,
            left: 10,
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
            maxWidth: 'calc(100% - 200px)',
            padding: '6px 10px',
            borderRadius: radius.md,
            background: 'rgba(21,25,34,0.92)',
            border: `1px solid ${colors.border.default}`,
            fontSize: 11.5,
            color: colors.text.secondary,
            fontFamily: font.sans,
          }}
        >
          {view.isClustered && (
            <span>
              {view.totalNodes} items in {view.clusterCount} folders. Click a folder to open it.
            </span>
          )}
          {view.truncated && <span style={{ color: colors.status.warning }}>Showing the most connected items only.</span>}
          {openFolders.length > 0 && (
            <button type="button" onClick={() => setExpanded(new Set())} style={toolbarButton}>
              <ChevronsDownUp size={12} /> Close all folders
            </button>
          )}
          {view.isClustered && !tooBigToExpandAll && (
            <button type="button" onClick={() => setExpandAll(true)} style={toolbarButton}>
              <ChevronsUpDown size={12} /> Show everything
            </button>
          )}
          {view.hiddenNoise > 0 && (
            <button type="button" onClick={() => setShowNoise(true)} style={toolbarButton}>
              Show {view.hiddenNoise} import / library nodes
            </button>
          )}
          {showNoise && (
            <button type="button" onClick={() => setShowNoise(false)} style={toolbarButton}>
              Hide import / library nodes
            </button>
          )}
          {expandAll && !view.isClustered && (
            <button type="button" onClick={() => setExpandAll(false)} style={toolbarButton}>
              <FolderOpen size={12} /> Group by folder
            </button>
          )}
        </div>
      )}
      <ReactFlow
        className="graph-canvas"
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={handleNodeClick}
        onNodeMouseEnter={(_, n) => setHoverId(n.id)}
        onNodeMouseLeave={() => setHoverId(null)}
        nodesDraggable={false}
        nodesConnectable={false}
        onlyRenderVisibleElements
        minZoom={0.05}
        maxZoom={2.5}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        proOptions={{ hideAttribution: true }}
        style={{ background: 'transparent' }}
      >
        <Background color="rgba(111, 120, 135, 0.08)" gap={24} size={1} />
        <Controls position="bottom-right" showInteractive={false} />
        <MiniMap
          position="top-right"
          pannable
          zoomable
          style={{ backgroundColor: colors.bg.surface, border: `1px solid ${colors.border.default}`, width: 150, height: 96 }}
          maskColor="rgba(15, 17, 21, 0.7)"
          nodeColor={(n) => TYPE_COLOR[(n.data as ItemData)?.nodeType] ?? '#8A928B'}
        />
      </ReactFlow>
    </div>
  );
};

const toolbarButton: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '2px 8px',
  borderRadius: radius.sm,
  border: `1px solid ${colors.border.default}`,
  background: colors.bg.surfaceSecondary,
  color: colors.text.primary,
  fontSize: 11,
  cursor: 'pointer',
};

const CONTROLS_CSS = `
.graph-canvas .react-flow__controls { box-shadow: 0 4px 16px rgba(0,0,0,0.35); border-radius: 6px; overflow: hidden; }
.graph-canvas .react-flow__controls-button { background: #151922; border-bottom: 1px solid #292F38; fill: #E6EAF0; color: #E6EAF0; }
.graph-canvas .react-flow__controls-button:hover { background: #1B2028; }
`;

export const FlowGraphView: React.FC<FlowGraphViewProps> = (props) => (
  <ReactFlowProvider>
    <FlowGraphInner {...props} />
  </ReactFlowProvider>
);
