/**
 * Pure helpers that turn the backend graph payload into a small, readable view:
 *
 * - parse any of the supported payload shapes (cytoscape elements, {nodes, edges}, arrays),
 * - drop duplicate and dangling edges,
 * - group nodes into folder clusters and collapse big graphs so only a few hundred
 *   boxes are ever on screen,
 * - aggregate edges between collapsed clusters (with a weight),
 * - support filters (high connectivity, cycles, direct neighbours) and search.
 *
 * Nothing here touches React, so it is easy to test and cheap to memoise.
 */

export interface RawNode {
  id: string;
  label: string;
  nodeType: string;
  filePath: string;
  metadata: Record<string, unknown>;
}

export interface RawEdge {
  source: string;
  target: string;
  edgeType: string;
}

export interface ParsedGraph {
  nodes: RawNode[];
  edges: RawEdge[];
  root: string;
}

export interface ViewNode {
  id: string;
  kind: 'cluster' | 'item';
  label: string;
  sublabel: string;
  nodeType: string;
  clusterId: string;
  count: number;
  hiddenCount: number;
  degree: number;
  raw?: RawNode;
  matches: boolean;
}

export interface ViewEdge {
  id: string;
  source: string;
  target: string;
  weight: number;
  edgeType: string;
}

export interface GraphView {
  nodes: ViewNode[];
  edges: ViewEdge[];
  totalNodes: number;
  clusterCount: number;
  collapsedClusters: number;
  isClustered: boolean;
  truncated: boolean;
  hiddenNoise: number;
}

export type GraphFilter = 'all' | 'high_connectivity' | 'circular' | 'selected_deps' | 'direct_deps';

export interface ViewOptions {
  expanded: ReadonlySet<string>;
  filter?: GraphFilter;
  selectedId?: string | null;
  search?: string;
  /** Graphs with more nodes than this start with folders collapsed. */
  collapseAbove?: number;
  /** Max members shown for one expanded folder. */
  maxPerCluster?: number;
  /** Hard cap on visible boxes. */
  maxVisible?: number;
  expandAll?: boolean;
  /** Hide import statements, unresolved references and external symbols (default true). */
  hideNoise?: boolean;
}

/** Node types that add a lot of boxes but little meaning in an overview. */
export const NOISE_TYPES = new Set(['import', 'reference']);

export function isNoise(n: RawNode): boolean {
  return NOISE_TYPES.has(n.nodeType) || n.id.startsWith('external::');
}

export const CLUSTER_PREFIX = 'cluster::';

type UnknownRecord = Record<string, unknown>;

function asRecord(v: unknown): UnknownRecord | null {
  return v && typeof v === 'object' ? (v as UnknownRecord) : null;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

export function normalisePath(p: string): string {
  return p.replace(/\\/g, '/');
}

/** Longest common folder prefix of a list of paths ('' when none). */
export function commonRoot(paths: string[]): string {
  const dirs = paths
    .map(normalisePath)
    .filter((p) => p.includes('/'))
    .map((p) => p.split('/').slice(0, -1));
  if (dirs.length === 0) return '';
  const first = dirs[0];
  let len = first.length;
  for (const d of dirs) {
    let i = 0;
    while (i < len && i < d.length && d[i] === first[i]) i += 1;
    len = i;
  }
  return first.slice(0, len).join('/');
}

export function parseGraphData(data: unknown): ParsedGraph {
  const rawNodes: UnknownRecord[] = [];
  const rawEdges: UnknownRecord[] = [];
  const take = (el: unknown) => {
    const rec = asRecord(el);
    if (!rec) return;
    const d = asRecord(rec.data) ?? rec;
    if (d.source != null && d.target != null) rawEdges.push(d);
    else if (d.id != null) rawNodes.push(d);
  };
  const rec = asRecord(data);
  if (Array.isArray(data)) data.forEach(take);
  else if (rec && Array.isArray(rec.elements)) rec.elements.forEach(take);
  else if (rec && (Array.isArray(rec.nodes) || Array.isArray(rec.edges))) {
    (Array.isArray(rec.nodes) ? rec.nodes : []).forEach(take);
    (Array.isArray(rec.edges) ? rec.edges : []).forEach((e) => {
      const r = asRecord(e);
      const d = r ? asRecord(r.data) ?? r : null;
      if (d && d.source != null && d.target != null) rawEdges.push(d);
    });
  }

  const nodes: RawNode[] = [];
  const seen = new Set<string>();
  for (const n of rawNodes) {
    const id = str(n.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const declared = str(n.file_path);
    const fallback = id.startsWith('external::') ? '' : id.includes('::') ? id.split('::')[0] : id;
    const filePath = normalisePath(declared || fallback);
    nodes.push({
      id,
      label: str(n.label) || id.split(/[/\\]/).pop() || id,
      nodeType: (str(n.node_type) || 'file').toLowerCase(),
      filePath,
      metadata: asRecord(n.metadata) ?? {},
    });
  }
  const edgeKeys = new Set<string>();
  const edges: RawEdge[] = [];
  for (const e of rawEdges) {
    const source = str(e.source);
    const target = str(e.target);
    if (!seen.has(source) || !seen.has(target) || source === target) continue;
    const key = `${source}\u0000${target}`;
    if (edgeKeys.has(key)) continue;
    edgeKeys.add(key);
    edges.push({ source, target, edgeType: str(e.edge_type) || 'depends' });
  }
  return { nodes, edges, root: commonRoot(nodes.map((n) => n.filePath)) };
}

/** Folder (relative to the common root, max two levels) a node belongs to. */
export function clusterOf(node: RawNode, root: string): string {
  if (!node.filePath || !node.filePath.includes('/')) return '(external)';
  let rel = node.filePath;
  if (root && rel.startsWith(root + '/')) rel = rel.slice(root.length + 1);
  const parts = rel.split('/').slice(0, -1);
  if (parts.length === 0) return '(root)';
  return parts.slice(0, 2).join('/');
}

/** Nodes that take part in a dependency cycle (strongly connected components of size > 1). */
export function nodesInCycles(nodes: RawNode[], edges: RawEdge[]): Set<string> {
  const adj = new Map<string, string[]>();
  nodes.forEach((n) => adj.set(n.id, []));
  edges.forEach((e) => adj.get(e.source)?.push(e.target));
  let index = 0;
  const idx = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const result = new Set<string>();

  // iterative Tarjan to avoid stack overflows on big graphs
  for (const start of adj.keys()) {
    if (idx.has(start)) continue;
    const work: Array<{ v: string; i: number }> = [{ v: start, i: 0 }];
    idx.set(start, index);
    low.set(start, index);
    index += 1;
    stack.push(start);
    onStack.add(start);
    while (work.length) {
      const frame = work[work.length - 1];
      const neighbours = adj.get(frame.v) ?? [];
      if (frame.i < neighbours.length) {
        const w = neighbours[frame.i];
        frame.i += 1;
        if (!idx.has(w)) {
          idx.set(w, index);
          low.set(w, index);
          index += 1;
          stack.push(w);
          onStack.add(w);
          work.push({ v: w, i: 0 });
        } else if (onStack.has(w)) {
          low.set(frame.v, Math.min(low.get(frame.v)!, idx.get(w)!));
        }
      } else {
        work.pop();
        if (work.length) {
          const parent = work[work.length - 1].v;
          low.set(parent, Math.min(low.get(parent)!, low.get(frame.v)!));
        }
        if (low.get(frame.v) === idx.get(frame.v)) {
          const comp: string[] = [];
          let w: string;
          do {
            w = stack.pop()!;
            onStack.delete(w);
            comp.push(w);
          } while (w !== frame.v);
          if (comp.length > 1) comp.forEach((c) => result.add(c));
        }
      }
    }
  }
  return result;
}

export function buildGraphView(parsed: ParsedGraph, options: ViewOptions): GraphView {
  const {
    expanded,
    filter = 'all',
    selectedId = null,
    search = '',
    collapseAbove = 120,
    maxPerCluster = 120,
    maxVisible = 400,
    expandAll = false,
    hideNoise = true,
  } = options;

  const degree = new Map<string, number>();
  parsed.edges.forEach((e) => {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  });

  // 1. filter raw nodes
  const noiseIds = hideNoise ? new Set(parsed.nodes.filter(isNoise).map((n) => n.id)) : new Set<string>();
  let keep: Set<string> | null = null;
  if (filter === 'high_connectivity') {
    keep = new Set(parsed.nodes.filter((n) => (degree.get(n.id) ?? 0) >= 3).map((n) => n.id));
  } else if (filter === 'circular') {
    keep = nodesInCycles(parsed.nodes, parsed.edges);
  } else if ((filter === 'direct_deps' || filter === 'selected_deps') && selectedId) {
    keep = new Set([selectedId]);
    parsed.edges.forEach((e) => {
      if (e.source === selectedId) keep!.add(e.target);
      if (e.target === selectedId) keep!.add(e.source);
    });
  }
  const nodes = parsed.nodes.filter((n) => !noiseIds.has(n.id) && (keep ? keep.has(n.id) : true));
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges = parsed.edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));

  const q = search.trim().toLowerCase();
  const matches = (n: RawNode) =>
    q.length > 0 && (n.label.toLowerCase().includes(q) || n.filePath.toLowerCase().includes(q));

  // 2. clusters
  const members = new Map<string, RawNode[]>();
  nodes.forEach((n) => {
    const c = clusterOf(n, parsed.root);
    if (!members.has(c)) members.set(c, []);
    members.get(c)!.push(n);
  });

  const focused = keep != null && filter !== 'high_connectivity';
  const clustered = !focused && !expandAll && nodes.length > collapseAbove && members.size > 1;

  const openClusters = new Set<string>();
  if (clustered) {
    expanded.forEach((c) => members.has(c) && openClusters.add(c));
    if (q) {
      // open up to three folders that contain search hits
      for (const [c, list] of members) {
        if (openClusters.size >= expanded.size + 3) break;
        if (list.some(matches)) openClusters.add(c);
      }
    }
  }

  const visibleId = new Map<string, string>();
  const viewNodes: ViewNode[] = [];
  let truncated = false;

  const relPath = (p: string) => (parsed.root && p.startsWith(parsed.root + '/') ? p.slice(parsed.root.length + 1) : p);

  const pushItem = (n: RawNode, clusterId: string) => {
    const folder = relPath(n.filePath).split('/').slice(0, -1).join('/');
    const isSymbol = n.nodeType !== 'file';
    viewNodes.push({
      id: n.id,
      kind: 'item',
      label: n.label,
      sublabel: isSymbol ? relPath(n.filePath) : folder || '.',
      nodeType: n.nodeType,
      clusterId,
      count: 1,
      hiddenCount: 0,
      degree: degree.get(n.id) ?? 0,
      raw: n,
      matches: matches(n),
    });
    visibleId.set(n.id, n.id);
  };

  if (!clustered) {
    const ordered = [...nodes].sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0));
    ordered.forEach((n, i) => {
      if (i < maxVisible || n.id === selectedId || matches(n)) pushItem(n, clusterOf(n, parsed.root));
      else truncated = true;
    });
  } else {
    for (const [c, list] of [...members.entries()].sort((a, b) => b[1].length - a[1].length)) {
      const cid = CLUSTER_PREFIX + c;
      if (openClusters.has(c)) {
        const ordered = [...list].sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0));
        const shown = ordered.filter((n, i) => i < maxPerCluster || n.id === selectedId || matches(n));
        shown.forEach((n) => pushItem(n, c));
        const hidden = list.length - shown.length;
        if (hidden > 0) {
          truncated = true;
          // hidden members collapse into a "+N more" box for this folder
          viewNodes.push({
            id: cid,
            kind: 'cluster',
            label: `${c.split('/').pop()} (+${hidden} more)`,
            sublabel: c,
            nodeType: 'cluster',
            clusterId: c,
            count: hidden,
            hiddenCount: hidden,
            degree: 0,
            matches: false,
          });
          ordered.filter((n) => !shown.includes(n)).forEach((n) => visibleId.set(n.id, cid));
        }
      } else {
        viewNodes.push({
          id: cid,
          kind: 'cluster',
          label: c === '(root)' ? '(root files)' : c === '(external)' ? 'External / library' : c.split('/').pop() || c,
          sublabel: c,
          nodeType: 'cluster',
          clusterId: c,
          count: list.length,
          hiddenCount: list.length,
          degree: 0,
          matches: list.some(matches),
        });
        list.forEach((n) => visibleId.set(n.id, cid));
      }
    }
  }

  // 3. aggregate edges onto visible boxes
  const agg = new Map<string, ViewEdge>();
  edges.forEach((e) => {
    const s = visibleId.get(e.source);
    const t = visibleId.get(e.target);
    if (!s || !t || s === t) return;
    const key = `${s}\u0000${t}`;
    const existing = agg.get(key);
    if (existing) {
      existing.weight += 1;
      if (existing.edgeType !== e.edgeType) existing.edgeType = 'mixed';
    } else {
      agg.set(key, { id: `e${agg.size}`, source: s, target: t, weight: 1, edgeType: e.edgeType });
    }
  });
  const viewEdges = [...agg.values()];
  const clusterDegree = new Map<string, number>();
  viewEdges.forEach((e) => {
    clusterDegree.set(e.source, (clusterDegree.get(e.source) ?? 0) + e.weight);
    clusterDegree.set(e.target, (clusterDegree.get(e.target) ?? 0) + e.weight);
  });
  viewNodes.forEach((n) => {
    if (n.kind === 'cluster') n.degree = clusterDegree.get(n.id) ?? 0;
  });

  return {
    nodes: viewNodes,
    edges: viewEdges,
    totalNodes: nodes.length,
    clusterCount: members.size,
    collapsedClusters: clustered ? [...members.keys()].filter((c) => !openClusters.has(c)).length : 0,
    isClustered: clustered,
    truncated,
    hiddenNoise: noiseIds.size,
  };
}
