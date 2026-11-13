import dagre from '@dagrejs/dagre';
import type { GraphView } from './graphModel';

export type LayoutType = 'cose' | 'dagre' | 'circle';

export const ITEM_W = 200;
export const ITEM_H = 46;
export const CLUSTER_W = 220;
export const CLUSTER_H = 58;

export interface Positioned {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Layered layout (dagre) so arrows mostly flow in one direction and boxes never overlap.
 *  - 'dagre'  → left-to-right layers (best for dependency chains)
 *  - 'cose'   → top-to-bottom layers (more compact on wide screens)
 *  - 'circle' → nodes on a circle, ordered by folder
 */
export function layoutGraphView(view: GraphView, type: LayoutType): Map<string, Positioned> {
  const sizes = new Map(
    view.nodes.map((n) => [n.id, n.kind === 'cluster' ? { w: CLUSTER_W, h: CLUSTER_H } : { w: ITEM_W, h: ITEM_H }])
  );
  const out = new Map<string, Positioned>();

  if (type === 'circle') {
    const ordered = [...view.nodes].sort((a, b) => a.clusterId.localeCompare(b.clusterId) || a.label.localeCompare(b.label));
    const n = Math.max(ordered.length, 1);
    const radius = Math.max(260, (n * (ITEM_W * 0.62)) / (2 * Math.PI));
    ordered.forEach((node, i) => {
      const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
      const s = sizes.get(node.id)!;
      out.set(node.id, {
        x: radius + radius * Math.cos(angle) - s.w / 2,
        y: radius + radius * Math.sin(angle) - s.h / 2,
        width: s.w,
        height: s.h,
      });
    });
    return out;
  }

  const g = new dagre.graphlib.Graph();
  const big = view.nodes.length > 150;
  g.setGraph({
    rankdir: type === 'dagre' ? 'LR' : 'TB',
    nodesep: type === 'dagre' ? 14 : 26,
    ranksep: type === 'dagre' ? 110 : 70,
    edgesep: 8,
    marginx: 20,
    marginy: 20,
    // 'longest-path' is much faster on big graphs, network-simplex looks nicer on small ones
    ranker: big ? 'longest-path' : 'network-simplex',
  });
  g.setDefaultEdgeLabel(() => ({}));
  view.nodes.forEach((n) => {
    const s = sizes.get(n.id)!;
    g.setNode(n.id, { width: s.w, height: s.h });
  });
  view.edges.forEach((e) => g.setEdge(e.source, e.target, { weight: e.weight }));
  dagre.layout(g);

  // dagre puts isolated nodes in the first layer; pack them into a grid underneath instead
  const connected = new Set<string>();
  view.edges.forEach((e) => {
    connected.add(e.source);
    connected.add(e.target);
  });
  let maxY = 0;
  let minX = Infinity;
  view.nodes.forEach((n) => {
    if (!connected.has(n.id) && view.edges.length > 0) return;
    const p = g.node(n.id);
    maxY = Math.max(maxY, p.y + p.height / 2);
    minX = Math.min(minX, p.x - p.width / 2);
  });
  if (!Number.isFinite(minX)) minX = 0;

  const isolated: string[] = [];
  view.nodes.forEach((n) => {
    if (view.edges.length > 0 && !connected.has(n.id)) {
      isolated.push(n.id);
      return;
    }
    const p = g.node(n.id);
    out.set(n.id, { x: p.x - p.width / 2, y: p.y - p.height / 2, width: p.width, height: p.height });
  });
  const cols = Math.max(4, Math.ceil(Math.sqrt(isolated.length * 2)));
  isolated.forEach((id, i) => {
    const s = sizes.get(id)!;
    out.set(id, {
      x: minX + (i % cols) * (ITEM_W + 24),
      y: maxY + 80 + Math.floor(i / cols) * (ITEM_H + 18),
      width: s.w,
      height: s.h,
    });
  });
  return out;
}
