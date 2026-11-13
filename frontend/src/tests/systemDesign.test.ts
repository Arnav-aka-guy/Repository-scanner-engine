import { describe, it, expect, vi, afterEach } from 'vitest';
import { layoutSystemDesign } from '../components/diagram/systemDesignLayout';
import { buildDiagramSvg, safeFileName } from '../components/diagram/exportDiagram';
import {
  generateSystemDesign,
  getCachedSystemDesign,
  type SystemDesignDiagram,
} from '../services/systemDesign';

function makeDiagram(): SystemDesignDiagram {
  const node = (id: string, group: SystemDesignDiagram['nodes'][number]['group'], kind = 'service', tech: string[] = []) => ({
    id,
    label: id.replace(/_/g, ' '),
    kind,
    group,
    description: '',
    tech,
    paths: [],
  });
  const edge = (source: string, target: string, label = '', kind = 'dependency') => ({
    id: `e_${source}__${target}`,
    source,
    target,
    label,
    kind,
  });
  return {
    title: 'Shop <script>alert(1)</script>',
    summary: 's',
    groups: [
      { id: 'client', label: 'Client', description: '' },
      { id: 'backend', label: 'Backend', description: '' },
      { id: 'data', label: 'Data & Storage', description: '' },
      { id: 'external', label: 'External Services', description: '' },
    ],
    nodes: [
      node('pages', 'client', 'ui', ['React']),
      node('api_client', 'client', 'api_client'),
      node('security', 'backend', 'security'),
      node('routers', 'backend', 'router', ['FastAPI']),
      node('search', 'backend'),
      node('rag', 'backend'),
      node('llm_manager', 'backend', 'llm_client'),
      node('db', 'data', 'database', ['SQLite']),
      node('vectors', 'data', 'vector_store'),
      node('groq', 'external', 'llm', ['Groq']),
    ],
    edges: [
      edge('pages', 'api_client'),
      edge('api_client', 'security', 'REST / SSE', 'network'),
      edge('security', 'routers'),
      edge('routers', 'search'),
      edge('routers', 'rag'),
      edge('rag', 'llm_manager'),
      edge('search', 'vectors', 'vectors', 'data'),
      edge('routers', 'db', 'SQL', 'data'),
      edge('llm_manager', 'groq', 'prompts', 'external'),
      // a cycle and a duplicate pair must not break the layout
      edge('search', 'routers'),
    ],
    flows: [{ name: 'Ask', steps: ['pages', 'api_client', 'security', 'routers', 'rag', 'llm_manager', 'groq'] }],
    mermaid: 'flowchart TB',
    generated_by: 'analysis',
    detail: 'overview',
    warnings: [],
    stats: {},
    generated_at: '',
    cache_hit: false,
  };
}

function overlaps(a: { x: number; y: number; width: number; height: number }, b: typeof a): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

describe('system design layout', () => {
  it('places groups in layers and never overlaps nodes', () => {
    const layout = layoutSystemDesign(makeDiagram());
    const g = Object.fromEntries(layout.groups.map((x) => [x.id, x]));
    expect(g.client.y).toBeLessThan(g.backend.y);
    expect(g.backend.y).toBeLessThan(g.data.y);
    expect(g.data.y).toBe(g.external.y);
    expect(g.data.x + g.data.width).toBeLessThanOrEqual(g.external.x);

    for (let i = 0; i < layout.nodes.length; i += 1) {
      for (let j = i + 1; j < layout.nodes.length; j += 1) {
        expect(overlaps(layout.nodes[i], layout.nodes[j])).toBe(false);
      }
    }
    // every node sits inside its group box
    layout.nodes.forEach((n) => {
      const box = g[n.group];
      expect(n.x).toBeGreaterThanOrEqual(box.x);
      expect(n.y).toBeGreaterThanOrEqual(box.y);
      expect(n.x + n.width).toBeLessThanOrEqual(box.x + box.width + 0.5);
      expect(n.y + n.height).toBeLessThanOrEqual(box.y + box.height + 0.5);
    });
    expect(layout.edges.every((e) => e.points.length >= 2)).toBe(true);
  });

  it('handles diagrams with missing groups and no edges', () => {
    const d = makeDiagram();
    d.nodes = d.nodes.filter((n) => n.group === 'backend');
    d.edges = [];
    d.groups = d.groups.filter((x) => x.id === 'backend');
    const layout = layoutSystemDesign(d);
    expect(layout.groups).toHaveLength(1);
    expect(layout.nodes).toHaveLength(5);
  });
});

describe('system design export', () => {
  it('builds an SVG that escapes text and contains every node', () => {
    const d = makeDiagram();
    const svg = buildDiagramSvg(d, layoutSystemDesign(d));
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
    d.nodes.forEach((n) => expect(svg).toContain(n.label));
  });

  it('makes safe file names', () => {
    expect(safeFileName('My App — system design!')).toBe('my-app-system-design');
    expect(safeFileName('///')).toBe('system-design');
  });
});

describe('system design service', () => {
  afterEach(() => vi.restoreAllMocks());

  it('posts repository_id, detail and AI options', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(makeDiagram()), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    await generateSystemDesign({ repositoryId: 7, repoPath: '/x' }, { detail: 'detailed', useAi: false, refresh: true });
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toContain('/api/system-design/generate');
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      detail: 'detailed',
      use_ai: false,
      refresh: true,
      repository_id: 7,
    });
  });

  it('returns null when nothing has been generated yet', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('null', { status: 200, headers: { 'Content-Type': 'application/json' } })
    );
    await expect(getCachedSystemDesign({ repositoryId: 3 })).resolves.toBeNull();
  });

  it('still throws real errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ detail: 'Repository not found or access denied.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    await expect(getCachedSystemDesign({ repositoryId: 3 })).rejects.toThrow(/not found/);
  });
});
