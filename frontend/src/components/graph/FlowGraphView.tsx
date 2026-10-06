import React, { useCallback, useMemo, useEffect, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
  MarkerType,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { colors, radius, font } from '../../design-system/tokens';

/* ── Custom Node Component ─────────────────────────────────────── */

const nodeStyles: Record<string, { bg: string; border: string; text: string; tagBg: string }> = {
  file: {
    bg: colors.bg.surface,
    border: 'rgba(91, 141, 239, 0.4)',
    text: colors.text.primary,
    tagBg: colors.accent.blueSubtle,
  },
  class: {
    bg: colors.bg.surface,
    border: 'rgba(149, 128, 202, 0.4)',
    text: colors.text.primary,
    tagBg: colors.accent.purpleSubtle,
  },
  function: {
    bg: colors.bg.surface,
    border: 'rgba(76, 175, 121, 0.4)',
    text: colors.text.primary,
    tagBg: colors.status.successSubtle,
  },
  method: {
    bg: colors.bg.surface,
    border: 'rgba(201, 148, 58, 0.4)',
    text: colors.text.primary,
    tagBg: colors.status.warningSubtle,
  },
  default: {
    bg: colors.bg.surface,
    border: colors.border.default,
    text: colors.text.secondary,
    tagBg: colors.bg.surfaceSecondary,
  },
};

function CodeNode({ data, selected }: NodeProps) {
  const nodeType = ((data.nodeType as string) || 'file').toLowerCase();
  const theme = nodeStyles[nodeType] || nodeStyles.default;
  const isHighlighted = Boolean(data.isHighlighted);
  const isDimmed = Boolean(data.isDimmed);

  return (
    <div
      style={{
        padding: '7px 12px',
        borderRadius: radius.md,
        backgroundColor: theme.bg,
        border: selected
          ? `2px solid ${colors.accent.blue}`
          : isHighlighted
          ? `2px solid #5B8DEF`
          : `1px solid ${theme.border}`,
        color: theme.text,
        fontSize: '11px',
        fontFamily: font.mono,
        fontWeight: 500,
        maxWidth: '220px',
        minWidth: '120px',
        overflow: 'hidden',
        boxShadow: selected ? '0 0 0 2px rgba(91, 141, 239, 0.25)' : 'none',
        opacity: isDimmed ? 0.35 : 1,
        transition: 'all 0.15s ease',
        cursor: 'pointer',
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: colors.accent.blue, width: 5, height: 5, border: 'none' }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span
          style={{
            fontSize: '8px',
            padding: '1px 5px',
            borderRadius: radius.sm,
            backgroundColor: theme.tagBg,
            color: colors.text.primary,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {nodeType}
        </span>
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          }}
          title={data.label as string}
        >
          {data.label as string}
        </span>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: colors.accent.blue, width: 5, height: 5, border: 'none' }}
      />
    </div>
  );
}

const nodeTypes = { codeNode: CodeNode };

/* ── Props ─────────────────────────────────────────────────────── */

export interface FlowGraphViewProps {
  graphData: any;
  onNodeClick?: (node: any) => void;
  selectedNodeId?: string | null;
  searchFilter?: string;
  graphFilter?: 'all' | 'high_connectivity' | 'circular' | 'selected_deps' | 'direct_deps';
  layoutType?: 'cose' | 'dagre' | 'circle';
}

/* ── Converter: Cytoscape format → React Flow format ─────────── */

function convertToFlowElements(
  data: any,
  layoutType: 'cose' | 'dagre' | 'circle' = 'cose'
): { nodes: Node[]; edges: Edge[] } {
  if (!data) return { nodes: [], edges: [] };

  const rawNodes: any[] = [];
  const rawEdges: any[] = [];

  // Handle various formats
  if (Array.isArray(data)) {
    data.forEach((el: any) => {
      if (el.data?.source && el.data?.target) {
        rawEdges.push(el.data);
      } else if (el.data?.id) {
        rawNodes.push(el.data);
      }
    });
  } else if (data.nodes && data.edges) {
    rawNodes.push(...(Array.isArray(data.nodes) ? data.nodes.map((n: any) => n.data || n) : []));
    rawEdges.push(...(Array.isArray(data.edges) ? data.edges.map((e: any) => e.data || e) : []));
  } else if (data.elements) {
    data.elements.forEach((el: any) => {
      if (el.data?.source && el.data?.target) {
        rawEdges.push(el.data);
      } else if (el.data?.id) {
        rawNodes.push(el.data);
      }
    });
  }

  // Calculate degree for layout and filtering
  const degreeMap = new Map<string, number>();
  rawEdges.forEach((e) => {
    degreeMap.set(e.source, (degreeMap.get(e.source) || 0) + 1);
    degreeMap.set(e.target, (degreeMap.get(e.target) || 0) + 1);
  });

  // Calculate layout coordinates
  const total = rawNodes.length;
  const nodes: Node[] = rawNodes.map((n, idx) => {
    let x = 0;
    let y = 0;

    if (layoutType === 'circle' && total > 0) {
      const radiusPx = Math.max(260, total * 32);
      const angle = (idx / total) * 2 * Math.PI;
      x = radiusPx + radiusPx * Math.cos(angle);
      y = radiusPx + radiusPx * Math.sin(angle);
    } else if (layoutType === 'dagre') {
      // Tiered flow
      const rank = degreeMap.get(n.id) || 0;
      const tier = Math.min(5, Math.floor(rank / 2));
      const col = idx % Math.max(1, Math.ceil(total / 4));
      x = col * 260;
      y = tier * 180;
    } else {
      // Force-directed / grid approximation
      const cols = Math.max(Math.ceil(Math.sqrt(total)), 1);
      x = (idx % cols) * 280;
      y = Math.floor(idx / cols) * 120;
    }

    return {
      id: n.id,
      type: 'codeNode',
      position: { x, y },
      data: {
        label: n.label || n.id,
        nodeType: n.node_type || 'file',
        filePath: n.file_path || n.id || '',
        metadata: n.metadata || {},
        degree: degreeMap.get(n.id) || 0,
      },
    };
  });

  const edges: Edge[] = rawEdges.map((e, idx) => ({
    id: `edge-${idx}-${e.source}-${e.target}`,
    source: e.source,
    target: e.target,
    type: 'smoothstep',
    animated: e.edge_type === 'calls',
    style: {
      stroke:
        e.edge_type === 'imports'
          ? 'rgba(91, 141, 239, 0.45)'
          : e.edge_type === 'calls'
          ? 'rgba(76, 175, 121, 0.45)'
          : e.edge_type === 'inherits'
          ? 'rgba(149, 128, 202, 0.45)'
          : 'rgba(111, 120, 135, 0.35)',
      strokeWidth: 1.5,
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: 'rgba(111, 120, 135, 0.6)',
      width: 14,
      height: 9,
    },
    label: e.edge_type || '',
    labelStyle: {
      fontSize: 8,
      fill: colors.text.muted,
      fontFamily: font.mono,
    },
    labelBgStyle: {
      fill: colors.bg.primary,
      fillOpacity: 0.85,
    },
  }));

  return { nodes, edges };
}

/* ── Internal Flow Component with ReactFlow API hooks ──────────── */

const FlowGraphInner: React.FC<FlowGraphViewProps> = ({
  graphData,
  onNodeClick,
  selectedNodeId,
  searchFilter = '',
  graphFilter = 'all',
  layoutType = 'cose',
}) => {
  const { fitView } = useReactFlow();

  const { nodes: rawNodes, edges: rawEdges } = useMemo(
    () => convertToFlowElements(graphData, layoutType),
    [graphData, layoutType]
  );

  // Apply filters to nodes and edges
  const { filteredNodes, filteredEdges } = useMemo(() => {
    let validNodeIds = new Set(rawNodes.map((n) => n.id));

    // High connectivity filter: degree >= 3
    if (graphFilter === 'high_connectivity') {
      const highNodes = rawNodes.filter((n) => (n.data.degree as number) >= 3);
      validNodeIds = new Set(highNodes.map((n) => n.id));
    } else if (graphFilter === 'direct_deps' && selectedNodeId) {
      const neighborIds = new Set<string>([selectedNodeId]);
      rawEdges.forEach((e) => {
        if (e.source === selectedNodeId) neighborIds.add(e.target);
        if (e.target === selectedNodeId) neighborIds.add(e.source);
      });
      validNodeIds = neighborIds;
    }

    const q = (searchFilter || '').trim().toLowerCase();

    const nodesWithHighlight = rawNodes
      .filter((n) => validNodeIds.has(n.id))
      .map((n) => {
        const matchesQuery = q ? (n.data.label as string).toLowerCase().includes(q) : false;
        const isSelected = selectedNodeId === n.id;
        return {
          ...n,
          selected: isSelected,
          data: {
            ...n.data,
            isHighlighted: matchesQuery,
            isDimmed: q.length > 0 && !matchesQuery && !isSelected,
          },
        };
      });

    const activeIds = new Set(nodesWithHighlight.map((n) => n.id));
    const edgesFiltered = rawEdges.filter(
      (e) => activeIds.has(e.source) && activeIds.has(e.target)
    );

    return { filteredNodes: nodesWithHighlight, filteredEdges: edgesFiltered };
  }, [rawNodes, rawEdges, graphFilter, selectedNodeId, searchFilter]);

  const [nodes, setNodes, onNodesChange] = useNodesState(filteredNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(filteredEdges);

  useEffect(() => {
    setNodes(filteredNodes);
    setEdges(filteredEdges);
  }, [filteredNodes, filteredEdges, setNodes, setEdges]);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (onNodeClick) {
        onNodeClick({
          id: node.id,
          label: node.data.label,
          node_type: node.data.nodeType,
          file_path: node.data.filePath,
          metadata: node.data.metadata,
        });
      }
    },
    [onNodeClick]
  );

  return (
    <div style={{ width: '100%', height: '100%', backgroundColor: colors.bg.primary }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.05}
        maxZoom={2.5}
        defaultEdgeOptions={{
          type: 'smoothstep',
        }}
        proOptions={{ hideAttribution: true }}
        style={{ background: 'transparent' }}
      >
        <Background color="rgba(111, 120, 135, 0.08)" gap={24} size={1} />
        <Controls
          position="bottom-right"
          showInteractive={false}
          style={{
            backgroundColor: colors.bg.surface,
            border: `1px solid ${colors.border.default}`,
            borderRadius: radius.md,
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
          }}
        />
        <MiniMap
          position="top-right"
          style={{
            backgroundColor: colors.bg.surface,
            border: `1px solid ${colors.border.default}`,
            borderRadius: radius.md,
            width: 140,
            height: 90,
          }}
          maskColor="rgba(15, 17, 21, 0.7)"
          nodeColor={(node) => {
            const type = (node.data?.nodeType as string) || 'default';
            const colorsMap: Record<string, string> = {
              file: colors.accent.blue,
              class: '#9580CA',
              function: '#4CAF79',
              method: '#C9943A',
              default: colors.text.muted,
            };
            return colorsMap[type] || colorsMap.default;
          }}
        />
      </ReactFlow>
    </div>
  );
};

/* ── Wrapped FlowGraphView ───────────────────────────────────────── */

export const FlowGraphView: React.FC<FlowGraphViewProps> = (props) => {
  return (
    <ReactFlowProvider>
      <FlowGraphInner {...props} />
    </ReactFlowProvider>
  );
};
