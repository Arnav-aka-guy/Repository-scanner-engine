import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { SystemDesignDiagram } from '../../services/systemDesign';
import { layoutSystemDesign, type SystemDesignLayout } from './systemDesignLayout';
import {
  CANVAS_BG,
  EDGE_COLOR,
  GROUP_THEME,
  KIND_ACCENT,
  KIND_LABEL,
  NODE_BG,
  NODE_BORDER,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from './diagramTheme';

/* node renderers */

type GroupData = { label: string; groupId: keyof typeof GROUP_THEME; width: number; height: number };
type DesignData = {
  label: string;
  kind: string;
  tech: string[];
  state: 'normal' | 'active' | 'related' | 'dimmed';
  step?: number;
};

const hiddenHandle: React.CSSProperties = { opacity: 0, width: 6, height: 6, border: 'none', pointerEvents: 'none' };

const GroupBox = memo(function GroupBox({ data }: NodeProps) {
  const d = data as unknown as GroupData;
  const theme = GROUP_THEME[d.groupId];
  return (
    <div
      style={{
        width: d.width,
        height: d.height,
        borderRadius: 14,
        border: `1.5px dashed ${theme.stroke}`,
        background: theme.fill,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          textAlign: 'center',
          paddingTop: 14,
          color: theme.title,
          fontSize: 14,
          fontWeight: 700,
          letterSpacing: '0',
        }}
      >
        {d.label}
      </div>
    </div>
  );
});

const DesignNode = memo(function DesignNode({ data }: NodeProps) {
  const d = data as unknown as DesignData;
  const accent = KIND_ACCENT[d.kind] ?? KIND_ACCENT.module;
  const active = d.state === 'active';
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        position: 'relative',
        background: NODE_BG,
        border: `1.2px solid ${active ? accent : NODE_BORDER}`,
        boxShadow: active ? `0 0 0 3px ${accent}33` : '0 2px 8px rgba(0,0,0,0.25)',
        borderRadius: 8,
        padding: '8px 12px 8px 16px',
        opacity: d.state === 'dimmed' ? 0.28 : 1,
        transition: 'opacity 120ms ease, box-shadow 120ms ease',
        cursor: 'pointer',
        overflow: 'hidden',
      }}
    >
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: accent }} />
      {['top', 'bottom', 'left', 'right'].map((side) => (
        <React.Fragment key={side}>
          <Handle
            id={`t-${side}`}
            type="target"
            position={side as Position}
            isConnectable={false}
            style={hiddenHandle}
          />
          <Handle
            id={`s-${side}`}
            type="source"
            position={side as Position}
            isConnectable={false}
            style={hiddenHandle}
          />
        </React.Fragment>
      ))}
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0', color: accent }}>
        {KIND_LABEL[d.kind] ?? d.kind}
      </div>
      <div
        style={{
          marginTop: 2,
          fontSize: 13.5,
          fontWeight: 600,
          color: TEXT_PRIMARY,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
        title={d.label}
      >
        {d.label}
      </div>
      {d.tech.length > 0 && (
        <div
          style={{
            marginTop: 3,
            fontSize: 10.5,
            color: TEXT_SECONDARY,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {d.tech.slice(0, 3).join(' · ')}
        </div>
      )}
      {d.step != null && (
        <div
          style={{
            position: 'absolute',
            top: 6,
            right: 8,
            minWidth: 18,
            height: 18,
            borderRadius: 9,
            background: '#35D7FF',
            color: '#0D0D10',
            fontSize: 11,
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {d.step}
        </div>
      )}
    </div>
  );
});

const nodeTypes = { designGroup: GroupBox, designNode: DesignNode };

/* helpers */

const CONTROLS_CSS = `
.sd-canvas .react-flow__controls { box-shadow: 0 4px 16px rgba(0,0,0,0.35); border-radius: 6px; overflow: hidden; }
.sd-canvas .react-flow__controls-button { background: #0D0D10; border-bottom: 1px solid #222228; fill: #F4F4F5; color: #F4F4F5; }
.sd-canvas .react-flow__controls-button:hover { background: #141418; }
`;

function pickHandles(
  s: { x: number; y: number; width: number; height: number },
  t: { x: number; y: number; width: number; height: number }
): { sourceHandle: string; targetHandle: string } {
  if (t.y >= s.y + s.height - 4) return { sourceHandle: 's-bottom', targetHandle: 't-top' };
  if (s.y >= t.y + t.height - 4) return { sourceHandle: 's-top', targetHandle: 't-bottom' };
  return t.x > s.x
    ? { sourceHandle: 's-right', targetHandle: 't-left' }
    : { sourceHandle: 's-left', targetHandle: 't-right' };
}

/* canvas */

export interface SystemDesignCanvasProps {
  diagram: SystemDesignDiagram;
  selectedId?: string | null;
  onSelect?: (nodeId: string | null) => void;
  /** Node ids of the request flow to highlight, in order. */
  flowSteps?: string[] | null;
  /** Receives the computed layout (used for SVG/PNG export). */
  onLayout?: (layout: SystemDesignLayout) => void;
}

const CanvasInner: React.FC<SystemDesignCanvasProps> = ({ diagram, selectedId, onSelect, flowSteps, onLayout }) => {
  const { fitView } = useReactFlow();
  const [hoverId, setHoverId] = useState<string | null>(null);

  const layout = useMemo(() => layoutSystemDesign(diagram), [diagram]);

  useEffect(() => {
    onLayout?.(layout);
  }, [layout, onLayout]);

  useEffect(() => {
    const t = setTimeout(() => fitView({ padding: 0.12, duration: 250 }), 30);
    return () => clearTimeout(t);
  }, [layout, fitView]);

  const focusId = hoverId ?? selectedId ?? null;
  const stepIndex = useMemo(() => {
    const m = new Map<string, number>();
    (flowSteps ?? []).forEach((id, i) => {
      if (!m.has(id)) m.set(id, i + 1);
    });
    return m;
  }, [flowSteps]);
  const flowEdgeKeys = useMemo(() => {
    const keys = new Set<string>();
    const steps = flowSteps ?? [];
    for (let i = 0; i < steps.length - 1; i += 1) keys.add(`${steps[i]}->${steps[i + 1]}`);
    return keys;
  }, [flowSteps]);

  const related = useMemo(() => {
    if (!focusId) return null;
    const set = new Set<string>([focusId]);
    layout.edges.forEach((e) => {
      if (e.source === focusId) set.add(e.target);
      if (e.target === focusId) set.add(e.source);
    });
    return set;
  }, [focusId, layout]);

  const nodes: Node[] = useMemo(() => {
    const groupNodes: Node[] = layout.groups.map((g) => ({
      id: `group:${g.id}`,
      type: 'designGroup',
      position: { x: g.x, y: g.y },
      data: { label: g.label, groupId: g.id, width: g.width, height: g.height },
      draggable: false,
      selectable: false,
      focusable: false,
      zIndex: -1,
      style: { width: g.width, height: g.height },
    }));
    const designNodes: Node[] = layout.nodes.map((n) => {
      let state: DesignData['state'] = 'normal';
      if (flowSteps && flowSteps.length > 0) {
        state = stepIndex.has(n.id) ? 'related' : 'dimmed';
        if (focusId === n.id) state = 'active';
      } else if (related) {
        state = n.id === focusId ? 'active' : related.has(n.id) ? 'related' : 'dimmed';
      }
      return {
        id: n.id,
        type: 'designNode',
        position: { x: n.x, y: n.y },
        data: { label: n.label, kind: n.kind, tech: n.tech, state, step: stepIndex.get(n.id) },
        draggable: false,
        style: { width: n.width, height: n.height },
        width: n.width,
        height: n.height,
      };
    });
    return [...groupNodes, ...designNodes];
  }, [layout, related, focusId, flowSteps, stepIndex]);

  const edges: Edge[] = useMemo(() => {
    const byId = new Map(layout.nodes.map((n) => [n.id, n]));
    const out: Edge[] = layout.edges.map((e) => {
      const color = EDGE_COLOR[e.kind] ?? EDGE_COLOR.dependency;
      const inFlow = flowEdgeKeys.has(`${e.source}->${e.target}`);
      const touching = focusId != null && (e.source === focusId || e.target === focusId);
      const flowMode = flowEdgeKeys.size > 0;
      const highlighted = flowMode ? inFlow : touching;
      const dimmed = flowMode ? !inFlow : focusId != null && !touching;
      const showLabel = Boolean(e.label) && !dimmed;
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        ...pickHandles(byId.get(e.source)!, byId.get(e.target)!),
        type: 'smoothstep',
        pathOptions: { borderRadius: 12, offset: 16 },
        label: showLabel ? e.label : undefined,
        labelStyle: { fill: TEXT_PRIMARY, fontSize: 10.5, fontWeight: 500 },
        labelBgStyle: { fill: CANVAS_BG, fillOpacity: 0.92, stroke: color, strokeOpacity: 0.35 },
        labelBgPadding: [6, 3] as [number, number],
        labelBgBorderRadius: 4,
        style: {
          stroke: highlighted && flowMode ? '#35D7FF' : color,
          strokeWidth: highlighted ? 2.4 : 1.4,
          opacity: dimmed ? 0.12 : highlighted ? 1 : 0.7,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: highlighted && flowMode ? '#35D7FF' : color,
          width: 16,
          height: 16,
        },
        zIndex: highlighted ? 5 : 0,
      };
    });
    // flow steps that are not directly connected get a dashed helper edge
    const existing = new Set(layout.edges.map((e) => `${e.source}->${e.target}`));
    const steps = flowSteps ?? [];
    for (let i = 0; i < steps.length - 1; i += 1) {
      const key = `${steps[i]}->${steps[i + 1]}`;
      const s = byId.get(steps[i]);
      const t = byId.get(steps[i + 1]);
      if (existing.has(key) || !s || !t) continue;
      out.push({
        id: `flow-${i}-${key}`,
        source: steps[i],
        target: steps[i + 1],
        ...pickHandles(s, t),
        type: 'smoothstep',
        style: { stroke: '#35D7FF', strokeWidth: 2, strokeDasharray: '6 5' },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#35D7FF', width: 16, height: 16 },
        zIndex: 6,
      });
    }
    return out;
  }, [layout, focusId, flowEdgeKeys, flowSteps]);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (node.type !== 'designNode') return;
      onSelect?.(node.id === selectedId ? null : node.id);
    },
    [onSelect, selectedId]
  );

  return (
    <ReactFlow
      className="sd-canvas"
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeClick={handleNodeClick}
      onPaneClick={() => onSelect?.(null)}
      onNodeMouseEnter={(_, n) => n.type === 'designNode' && setHoverId(n.id)}
      onNodeMouseLeave={() => setHoverId(null)}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      minZoom={0.15}
      maxZoom={2}
      fitView
      fitViewOptions={{ padding: 0.12 }}
      proOptions={{ hideAttribution: true }}
      style={{ background: CANVAS_BG }}
    >
      <style>{CONTROLS_CSS}</style>
      <Background color="rgba(107, 107, 117, 0.10)" gap={22} size={1} />
      <Controls position="bottom-right" showInteractive={false} />
    </ReactFlow>
  );
};

export const SystemDesignCanvas: React.FC<SystemDesignCanvasProps> = (props) => (
  <ReactFlowProvider>
    <CanvasInner {...props} />
  </ReactFlowProvider>
);

export default SystemDesignCanvas;
