import { describe, it, expect } from 'vitest';
import {
  buildGraphView,
  clusterOf,
  commonRoot,
  nodesInCycles,
  parseGraphData,
  CLUSTER_PREFIX,
} from '../components/graph/graphModel';
import { layoutGraphView } from '../components/graph/graphLayout';

function elements(nodeCount: number, folders: string[]) {
  const els: unknown[] = [];
  for (let i = 0; i < nodeCount; i += 1) {
    const folder = folders[i % folders.length];
    const id = `/repo/${folder}/f${i}.py`;
    els.push({ data: { id, label: `f${i}.py`, node_type: 'file', file_path: id } });
    if (i > 0) {
      const prev = `/repo/${folders[(i - 1) % folders.length]}/f${i - 1}.py`;
      els.push({ data: { source: id, target: prev, edge_type: 'imports' } });
    }
  }
  return { elements: els };
}

describe('graph model', () => {
  it('parses cytoscape elements and drops duplicate / dangling edges', () => {
    const g = parseGraphData({
      elements: [
        { data: { id: 'a', label: 'a.py', file_path: '/r/a.py' } },
        { data: { id: 'b', label: 'b.py', file_path: '/r/b.py' } },
        { data: { source: 'a', target: 'b', edge_type: 'imports' } },
        { data: { source: 'a', target: 'b', edge_type: 'imports' } },
        { data: { source: 'a', target: 'ghost' } },
        { data: { source: 'a', target: 'a' } },
      ],
    });
    expect(g.nodes).toHaveLength(2);
    expect(g.edges).toHaveLength(1);
  });

  it('finds the common root and folder clusters (also with Windows paths)', () => {
    expect(commonRoot(['/r/x/a.py', '/r/x/b/c.py'])).toBe('/r/x');
    const g = parseGraphData({ nodes: [{ id: 'C:\\r\\api\\a.py' }, { id: 'C:\\r\\db\\b.py' }], edges: [] });
    expect(g.root).toBe('C:/r');
    expect(clusterOf(g.nodes[0], g.root)).toBe('api');
  });

  it('keeps small graphs flat', () => {
    const view = buildGraphView(parseGraphData(elements(30, ['api', 'db'])), { expanded: new Set() });
    expect(view.isClustered).toBe(false);
    expect(view.nodes).toHaveLength(30);
  });

  it('collapses big graphs into folders and aggregates edges', () => {
    const parsed = parseGraphData(elements(600, ['api', 'db', 'llm', 'graph', 'search']));
    const view = buildGraphView(parsed, { expanded: new Set() });
    expect(view.isClustered).toBe(true);
    expect(view.nodes.every((n) => n.kind === 'cluster')).toBe(true);
    expect(view.nodes).toHaveLength(5);
    expect(view.edges.length).toBeGreaterThan(0);
    expect(view.edges.every((e) => e.weight >= 1)).toBe(true);

    const opened = buildGraphView(parsed, { expanded: new Set(['api']) });
    expect(opened.nodes.filter((n) => n.kind === 'item').length).toBe(120);
    expect(opened.nodes.some((n) => n.id === `${CLUSTER_PREFIX}api`)).toBe(false);
    expect(opened.nodes.filter((n) => n.kind === 'cluster')).toHaveLength(4);
  });

  it('opens folders that contain search matches', () => {
    const parsed = parseGraphData(elements(300, ['api', 'db', 'llm']));
    const view = buildGraphView(parsed, { expanded: new Set(), search: 'f10.py' });
    expect(view.nodes.some((n) => n.kind === 'item' && n.matches)).toBe(true);
  });

  it('direct_deps shows only the selected node and its neighbours', () => {
    const parsed = parseGraphData(elements(600, ['api', 'db']));
    const selected = '/repo/db/f5.py';
    const view = buildGraphView(parsed, { expanded: new Set(), filter: 'direct_deps', selectedId: selected });
    expect(view.isClustered).toBe(false);
    expect(view.nodes.map((n) => n.id).sort()).toEqual(['/repo/api/f4.py', '/repo/api/f6.py', selected].sort());
  });

  it('hides import / external reference noise by default', () => {
    const g = parseGraphData({
      elements: [
        { data: { id: '/r/a.py', node_type: 'file', file_path: '/r/a.py' } },
        { data: { id: '/r/a.py::run', node_type: 'function', file_path: '/r/a.py' } },
        { data: { id: '/r/a.py::import:os', node_type: 'import', file_path: '/r/a.py' } },
        { data: { id: 'external::BaseModel', node_type: 'class', file_path: '' } },
      ],
    });
    expect(g.root).toBe('/r');
    const hidden = buildGraphView(g, { expanded: new Set() });
    expect(hidden.nodes.map((n) => n.id).sort()).toEqual(['/r/a.py', '/r/a.py::run']);
    expect(hidden.hiddenNoise).toBe(2);
    const shown = buildGraphView(g, { expanded: new Set(), hideNoise: false });
    expect(shown.nodes).toHaveLength(4);
    expect(clusterOf(g.nodes[3], g.root)).toBe('(external)');
  });

  it('detects cycles', () => {
    const g = parseGraphData({
      elements: [
        { data: { id: 'a' } },
        { data: { id: 'b' } },
        { data: { id: 'c' } },
        { data: { source: 'a', target: 'b' } },
        { data: { source: 'b', target: 'a' } },
        { data: { source: 'b', target: 'c' } },
      ],
    });
    expect([...nodesInCycles(g.nodes, g.edges)].sort()).toEqual(['a', 'b']);
  });

  it('layout never overlaps boxes and is fast for a few hundred nodes', () => {
    const parsed = parseGraphData(elements(380, ['api']));
    const view = buildGraphView(parsed, { expanded: new Set(), collapseAbove: 1000 });
    const t = performance.now();
    const pos = layoutGraphView(view, 'dagre');
    expect(performance.now() - t).toBeLessThan(4000);
    const boxes = [...pos.values()];
    const key = (b: { x: number; y: number }) => `${Math.round(b.x)}:${Math.round(b.y)}`;
    expect(new Set(boxes.map(key)).size).toBe(boxes.length);
  });
});
