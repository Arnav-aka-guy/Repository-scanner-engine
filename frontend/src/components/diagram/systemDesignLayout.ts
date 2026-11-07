import dagre from '@dagrejs/dagre';
import type { DesignEdge, DesignGroupId, DesignNode, SystemDesignDiagram } from '../../services/systemDesign';

/**
 * Layered layout for system design diagrams, in the classic textbook style:
 *
 *   ┌──────── Client ────────┐
 *   └───────────┬────────────┘
 *   ┌──────── Backend ───────┐
 *   └───────────┬────────────┘
 *   ┌─ Data & Storage ─┐ ┌─ External ─┐
 *
 * Each group is laid out on its own with dagre (top-to-bottom), then the groups are
 * stacked. All positions are absolute, so the same layout drives both the React Flow
 * canvas and the SVG/PNG export.
 */

export const NODE_WIDTH = 212;
export const NODE_HEIGHT = 58;
export const NODE_HEIGHT_WITH_TECH = 72;
const GROUP_PAD_X = 28;
const GROUP_PAD_TOP = 46;
const GROUP_PAD_BOTTOM = 26;
const GROUP_GAP_Y = 84;
const GROUP_GAP_X = 64;
const GRID_GAP = 28;

export interface Point {
  x: number;
  y: number;
}

export interface PlacedNode extends DesignNode {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PlacedGroup {
  id: DesignGroupId;
  label: string;
  description: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PlacedEdge extends DesignEdge {
  points: Point[];
  crossGroup: boolean;
}

export interface SystemDesignLayout {
  groups: PlacedGroup[];
  nodes: PlacedNode[];
  edges: PlacedEdge[];
  width: number;
  height: number;
}

function nodeHeight(n: DesignNode): number {
  return n.tech && n.tech.length > 0 ? NODE_HEIGHT_WITH_TECH : NODE_HEIGHT;
}

interface LocalLayout {
  width: number;
  height: number;
  positions: Map<string, { x: number; y: number; w: number; h: number }>;
  edgePoints: Map<string, Point[]>;
}

function layoutGrid(nodes: DesignNode[], columns: number): LocalLayout {
  const positions = new Map<string, { x: number; y: number; w: number; h: number }>();
  const cols = Math.max(1, Math.min(columns, nodes.length));
  const rowHeights: number[] = [];
  nodes.forEach((n, i) => {
    const row = Math.floor(i / cols);
    rowHeights[row] = Math.max(rowHeights[row] ?? 0, nodeHeight(n));
  });
  let y = 0;
  const rowY: number[] = [];
  rowHeights.forEach((h, r) => {
    rowY[r] = y;
    y += h + GRID_GAP;
  });
  nodes.forEach((n, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    positions.set(n.id, { x: col * (NODE_WIDTH + GRID_GAP), y: rowY[row], w: NODE_WIDTH, h: nodeHeight(n) });
  });
  return {
    width: cols * NODE_WIDTH + (cols - 1) * GRID_GAP,
    height: Math.max(0, y - GRID_GAP),
    positions,
    edgePoints: new Map(),
  };
}

function layoutWithDagre(nodes: DesignNode[], edges: DesignEdge[]): LocalLayout {
  const g = new dagre.graphlib.Graph({ multigraph: false });
  g.setGraph({ rankdir: 'TB', nodesep: 34, ranksep: 52, edgesep: 14, marginx: 0, marginy: 0, ranker: 'network-simplex' });
  g.setDefaultEdgeLabel(() => ({}));
  nodes.forEach((n) => g.setNode(n.id, { width: NODE_WIDTH, height: nodeHeight(n) }));
  edges.forEach((e) => g.setEdge(e.source, e.target, {}));
  dagre.layout(g);

  const positions = new Map<string, { x: number; y: number; w: number; h: number }>();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  nodes.forEach((n) => {
    const p = g.node(n.id);
    const x = p.x - p.width / 2;
    const y = p.y - p.height / 2;
    positions.set(n.id, { x, y, w: p.width, h: p.height });
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + p.width);
    maxY = Math.max(maxY, y + p.height);
  });
  positions.forEach((p) => {
    p.x -= minX;
    p.y -= minY;
  });
  const edgePoints = new Map<string, Point[]>();
  edges.forEach((e) => {
    const data = g.edge(e.source, e.target) as { points?: Point[] } | undefined;
    if (data?.points) edgePoints.set(e.id, data.points.map((pt) => ({ x: pt.x - minX, y: pt.y - minY })));
  });
  return { width: maxX - minX, height: maxY - minY, positions, edgePoints };
}

/** If a dagre layout is much wider than tall (few internal edges), fall back to a tidy grid. */
function layoutGroup(nodes: DesignNode[], edges: DesignEdge[], preferGrid: boolean): LocalLayout {
  if (nodes.length === 0) return { width: 0, height: 0, positions: new Map(), edgePoints: new Map() };
  const columns = nodes.length <= 4 ? nodes.length : nodes.length <= 9 ? 3 : 4;
  if (preferGrid || edges.length === 0) return layoutGrid(nodes, preferGrid ? Math.min(3, columns) : columns);
  const layered = layoutWithDagre(nodes, edges);
  if (layered.width > 5 * NODE_WIDTH && layered.width > layered.height * 4) {
    return layoutGrid(nodes, columns);
  }
  return layered;
}

export function layoutSystemDesign(diagram: Pick<SystemDesignDiagram, 'groups' | 'nodes' | 'edges'>): SystemDesignLayout {
  const groupOf = new Map(diagram.nodes.map((n) => [n.id, n.group]));
  const groupMeta = new Map(diagram.groups.map((g) => [g.id, g]));
  const order: DesignGroupId[] = ['client', 'backend', 'data', 'external'];

  const local = new Map<DesignGroupId, LocalLayout>();
  for (const gid of order) {
    const members = diagram.nodes.filter((n) => n.group === gid);
    if (members.length === 0) continue;
    const internal = diagram.edges.filter((e) => groupOf.get(e.source) === gid && groupOf.get(e.target) === gid);
    local.set(gid, layoutGroup(members, internal, gid === 'data' || gid === 'external'));
  }

  const box = (gid: DesignGroupId) => {
    const l = local.get(gid);
    if (!l) return null;
    const label = groupMeta.get(gid)?.label ?? gid;
    const titleWidth = label.length * 9 + 40;
    return { w: Math.max(l.width + GROUP_PAD_X * 2, titleWidth), h: l.height + GROUP_PAD_TOP + GROUP_PAD_BOTTOM };
  };

  // rows: [client], [backend], [data, external]
  const rows: DesignGroupId[][] = [['client'], ['backend'], ['data', 'external']]
    .map((row) => row.filter((gid) => local.has(gid as DesignGroupId)) as DesignGroupId[])
    .filter((row) => row.length > 0);

  const rowWidths = rows.map((row) =>
    row.reduce((sum, gid, i) => sum + (box(gid)?.w ?? 0) + (i > 0 ? GROUP_GAP_X : 0), 0)
  );
  const totalWidth = Math.max(0, ...rowWidths);

  const groups: PlacedGroup[] = [];
  const nodes: PlacedNode[] = [];
  const offsets = new Map<DesignGroupId, Point>();
  let y = 0;
  rows.forEach((row, r) => {
    let x = (totalWidth - rowWidths[r]) / 2;
    const rowHeight = Math.max(...row.map((gid) => box(gid)?.h ?? 0));
    row.forEach((gid) => {
      const b = box(gid)!;
      const l = local.get(gid)!;
      const meta = groupMeta.get(gid);
      groups.push({
        id: gid,
        label: meta?.label ?? gid,
        description: meta?.description ?? '',
        x,
        y,
        width: b.w,
        height: rowHeight,
      });
      const innerX = x + (b.w - l.width) / 2;
      const innerY = y + GROUP_PAD_TOP;
      offsets.set(gid, { x: innerX, y: innerY });
      diagram.nodes
        .filter((n) => n.group === gid)
        .forEach((n) => {
          const p = l.positions.get(n.id)!;
          nodes.push({ ...n, x: innerX + p.x, y: innerY + p.y, width: p.w, height: p.h });
        });
      x += b.w + GROUP_GAP_X;
    });
    y += rowHeight + GROUP_GAP_Y;
  });

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  let crossIndex = 0;
  const crossTotal = Math.max(1, diagram.edges.filter((e) => groupOf.get(e.source) !== groupOf.get(e.target)).length);
  const edges: PlacedEdge[] = diagram.edges
    .filter((e) => nodeById.has(e.source) && nodeById.has(e.target))
    .map((e) => {
      const s = nodeById.get(e.source)!;
      const t = nodeById.get(e.target)!;
      const gid = groupOf.get(e.source)!;
      const crossGroup = gid !== groupOf.get(e.target);
      const routed = !crossGroup ? localEdgePoints(gid, e.id) : undefined;
      // spread cross-group connectors over different horizontal tracks so they do not overlap
      const lane = crossGroup ? 0.2 + 0.6 * ((crossIndex++ % crossTotal) / crossTotal) : 0.5;
      return { ...e, crossGroup, points: routed ?? elbow(s, t, lane) };
    });

  function localEdgePoints(gid: DesignGroupId, edgeId: string): Point[] | undefined {
    const pts = local.get(gid)?.edgePoints.get(edgeId);
    const off = offsets.get(gid);
    if (!pts || !off) return undefined;
    return pts.map((p) => ({ x: p.x + off.x, y: p.y + off.y }));
  }

  return { groups, nodes, edges, width: totalWidth, height: Math.max(0, y - GROUP_GAP_Y) };
}

/** Simple orthogonal connector between two boxes (used for cross-group edges in exports). */
export function elbow(
  s: { x: number; y: number; width: number; height: number },
  t: typeof s,
  lane = 0.5
): Point[] {
  const sx = s.x + s.width / 2;
  const tx = t.x + t.width / 2;
  if (t.y >= s.y + s.height) {
    const sy = s.y + s.height;
    const ty = t.y;
    const midY = sy + (ty - sy) * lane;
    return [
      { x: sx, y: sy },
      { x: sx, y: midY },
      { x: tx, y: midY },
      { x: tx, y: ty },
    ];
  }
  if (s.y >= t.y + t.height) {
    const sy = s.y;
    const ty = t.y + t.height;
    const midY = ty + (sy - ty) / 2;
    return [
      { x: sx, y: sy },
      { x: sx, y: midY },
      { x: tx, y: midY },
      { x: tx, y: ty },
    ];
  }
  // side by side
  const leftToRight = t.x > s.x;
  const sy = s.y + s.height / 2;
  const ty = t.y + t.height / 2;
  const sxx = leftToRight ? s.x + s.width : s.x;
  const txx = leftToRight ? t.x : t.x + t.width;
  const midX = sxx + (txx - sxx) / 2;
  return [
    { x: sxx, y: sy },
    { x: midX, y: sy },
    { x: midX, y: ty },
    { x: txx, y: ty },
  ];
}
