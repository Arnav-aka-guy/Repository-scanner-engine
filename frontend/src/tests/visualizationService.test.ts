import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getMermaidDiagram, getArchitectureDiagram } from '../services/visualization';

global.fetch = vi.fn();

const mockFetch = (data: unknown, status = 200) => {
  (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as Response);
};

beforeEach(() => vi.clearAllMocks());

describe('getMermaidDiagram', () => {
  it('returns diagram data on success', async () => {
    mockFetch({ graph_type: 'dependency', diagram: 'graph TD\nA-->B' });
    const result = await getMermaidDiagram('/repo/path', 'dependency');
    expect(result.graph_type).toBe('dependency');
    expect(result.diagram).toContain('graph TD');
  });

  it('throws on non-ok response', async () => {
    mockFetch({ detail: 'Repository not found' }, 400);
    await expect(getMermaidDiagram('/bad/path')).rejects.toThrow('Repository not found');
  });

  it('defaults to dependency graph type', async () => {
    mockFetch({ graph_type: 'dependency', diagram: 'graph TD' });
    await getMermaidDiagram('/repo/path');
    const calledUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).toContain('graph_type=dependency');
  });
});

describe('getArchitectureDiagram', () => {
  it('returns architecture layers on success', async () => {
    mockFetch({
      layers: [{ name: 'backend', files: ['backend/main.py'], dependencies: [] }],
      diagram: 'graph TD\nbackend["backend (1 files)"]',
    });
    const result = await getArchitectureDiagram('/repo/path');
    expect(result.layers).toHaveLength(1);
    expect(result.layers[0].name).toBe('backend');
    expect(result.diagram).toContain('graph TD');
  });

  it('throws with detail message on error', async () => {
    mockFetch({ detail: 'Failed to build dependency graph.' }, 500);
    await expect(getArchitectureDiagram('/bad/path')).rejects.toThrow(
      'Failed to build dependency graph.'
    );
  });
});
