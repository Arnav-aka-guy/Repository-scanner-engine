import React, { useCallback, useMemo } from 'react';
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
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

/* ── Custom Node Component ─────────────────────────────────────── */

const nodeColors: Record<string, string> = {
  file: 'rgba(96, 165, 250, 0.15)',
  class: 'rgba(203, 166, 247, 0.15)',
  function: 'rgba(166, 227, 161, 0.15)',
  method: 'rgba(250, 204, 21, 0.15)',
  layer: 'rgba(96, 165, 250, 0.08)',
  default: 'rgba(148, 163, 184, 0.1)',
};

const nodeBorders: Record<string, string> = {
  file: 'rgba(96, 165, 250, 0.3)',
  class: 'rgba(203, 166, 247, 0.3)',
  function: 'rgba(166, 227, 161, 0.3)',
  method: 'rgba(250, 204, 21, 0.3)',
  layer: 'rgba(96, 165, 250, 0.15)',
  default: 'rgba(148, 163, 184, 0.2)',
};

const nodeTextColors: Record<string, string> = {
  file: 'var(--accent-primary)',
  class: 'var(--accent-purple)',
  function: 'var(--accent-green)',
  method: 'var(--accent-yellow)',
  layer: 'var(--text-primary)',
  default: 'var(--text-secondary)',
};

function CodeNode({ data }: NodeProps) {
  const nodeType = (data.nodeType as string) || 'default';
  return (
    <div
      style={{
        padding: '8px 14px',
        borderRadius: '10px',
        background: nodeColors[nodeType] || nodeColors.default,
        border: `1px solid ${nodeBorders[nodeType] || nodeBorders.default}`,
        color: nodeTextColors[nodeType] || nodeTextColors.default,
        fontSize: '11px',
        fontFamily: 'JetBrains Mono, monospace',
        fontWeight: 600,
        maxWidth: '200px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        backdropFilter: 'blur(8px)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: 'var(--accent-primary)', width: 6, height: 6, border: 'none' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{
          fontSize: '8px',
          padding: '1px 5px',
          borderRadius: '4px',
          background: nodeBorders[nodeType] || nodeBorders.default,
          color: nodeTextColors[nodeType] || nodeTextColors.default,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          fontWeight: 700,
        }}>
          {nodeType}
        </span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {data.label as string}
        </span>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: 'var(--accent-primary)', width: 6, height: 6, border: 'none' }} />
    </div>
  );
}

const nodeTypes = { codeNode: CodeNode };

/* ── Props ─────────────────────────────────────────────────────── */

interface FlowGraphViewProps {
  graphData: any;
  onNodeClick?: (node: any) => void;
}

/* ── Converter: Cytoscape format → React Flow format ─────────── */

function convertToFlowElements(data: any): { nodes: Node[]; edges: Edge[] } {
  if (!data) return { nodes: [], edges: [] };

  const rawNodes: any[] = [];
  const rawEdges: any[] = [];

  // Handle various data formats
  if (Array.isArray(data)) {
    // Cytoscape elements array
    data.forEach((el: any) => {
      if (el.data?.source && el.data?.target) {
        rawEdges.push(el.data);
      } else if (el.data?.id) {
        rawNodes.push(el.data);
      }
    });
  } else if (data.nodes && data.edges) {
    // {nodes: [], edges: []} format
    rawNodes.push(...(Array.isArray(data.nodes) ? data.nodes.map((n: any) => n.data || n) : []));
    rawEdges.push(...(Array.isArray(data.edges) ? data.edges.map((e: any) => e.data || e) : []));
  } else if (data.elements) {
    // {elements: [{data: ...}]} format
    data.elements.forEach((el: any) => {
      if (el.data?.source && el.data?.target) {
        rawEdges.push(el.data);
      } else if (el.data?.id) {
        rawNodes.push(el.data);
      }
    });
  }

  // Layout: deterministic grid layout
  const COLS = Math.max(Math.ceil(Math.sqrt(rawNodes.length)), 1);
  const COL_SPACING = 280;
  const ROW_SPACING = 120;

  const nodes: Node[] = rawNodes.map((n, idx) => ({
    id: n.id,
    type: 'codeNode',
    position: {
      x: (idx % COLS) * COL_SPACING,
      y: Math.floor(idx / COLS) * ROW_SPACING,
    },
    data: {
      label: n.label || n.id,
      nodeType: n.node_type || 'file',
      filePath: n.file_path || '',
      metadata: n.metadata || {},
    },
  }));

  const edges: Edge[] = rawEdges.map((e, idx) => ({
    id: `edge-${idx}-${e.source}-${e.target}`,
    source: e.source,
    target: e.target,
    type: 'smoothstep',
    animated: e.edge_type === 'calls',
    style: {
      stroke: e.edge_type === 'imports' ? 'rgba(96, 165, 250, 0.4)' :
              e.edge_type === 'calls' ? 'rgba(166, 227, 161, 0.4)' :
              e.edge_type === 'inherits' ? 'rgba(203, 166, 247, 0.4)' :
              'rgba(148, 163, 184, 0.3)',
      strokeWidth: 1.5,
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: 'rgba(148, 163, 184, 0.5)',
      width: 15,
      height: 10,
    },
    label: e.edge_type || '',
    labelStyle: {
      fontSize: 8,
      fill: 'var(--text-muted)',
      fontFamily: 'JetBrains Mono, monospace',
    },
    labelBgStyle: {
      fill: 'rgba(10, 10, 18, 0.8)',
      fillOpacity: 0.8,
    },
  }));

  return { nodes, edges };
}

/* ── Component ─────────────────────────────────────────────────── */

export const FlowGraphView: React.FC<FlowGraphViewProps> = ({ graphData, onNodeClick }) => {
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => convertToFlowElements(graphData),
    [graphData]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Reset nodes when data changes
  React.useEffect(() => {
    const { nodes: newNodes, edges: newEdges } = convertToFlowElements(graphData);
    setNodes(newNodes);
    setEdges(newEdges);
  }, [graphData, setNodes, setEdges]);

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
    <div style={{ width: '100%', height: '100%', background: 'var(--bg-primary)' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={3}
        defaultEdgeOptions={{
          type: 'smoothstep',
        }}
        proOptions={{ hideAttribution: true }}
        style={{ background: 'transparent' }}
      >
        <Background
          color="rgba(148, 163, 184, 0.05)"
          gap={20}
          size={1}
        />
        <Controls
          position="bottom-right"
          style={{
            background: 'rgba(15, 15, 26, 0.9)',
            border: '1px solid var(--border-color)',
            borderRadius: '10px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          }}
        />
        <MiniMap
          position="top-right"
          style={{
            background: 'rgba(15, 15, 26, 0.9)',
            border: '1px solid var(--border-color)',
            borderRadius: '10px',
          }}
          maskColor="rgba(0, 0, 0, 0.5)"
          nodeColor={(node) => {
            const type = (node.data?.nodeType as string) || 'default';
            const colors: Record<string, string> = {
              file: '#60A5FA',
              class: '#CBA6F7',
              function: '#A6E3A1',
              method: '#FACC15',
              default: '#94A3B8',
            };
            return colors[type] || colors.default;
          }}
        />
      </ReactFlow>
    </div>
  );
};
