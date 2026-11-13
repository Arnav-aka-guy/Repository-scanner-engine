import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import SystemDesign from '../pages/SystemDesign';
import { useWorkspaceStore } from '../stores/workspaceStore';

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

const DIAGRAM = {
  title: 'Shop system design',
  summary: 'A React client calls a FastAPI backend.',
  groups: [
    { id: 'client', label: 'Client', description: '' },
    { id: 'backend', label: 'Backend', description: '' },
  ],
  nodes: [
    { id: 'pages', label: 'Pages', kind: 'ui', group: 'client', description: 'Screens', tech: ['React'], paths: [] },
    { id: 'api', label: 'API routers', kind: 'router', group: 'backend', description: 'Endpoints', tech: [], paths: [] },
  ],
  edges: [{ id: 'e_pages__api', source: 'pages', target: 'api', label: 'REST', kind: 'network' }],
  flows: [{ name: 'Open a page', steps: ['pages', 'api'] }],
  mermaid: 'flowchart TB',
  generated_by: 'groq:test',
  detail: 'overview',
  warnings: ['Heads up'],
  stats: {},
  generated_at: '2026-11-07T00:00:00Z',
  cache_hit: false,
};

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

async function flush(times = 6) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

async function mount() {
  await act(async () => {
    root.render(
      <MemoryRouter>
        <SystemDesign />
      </MemoryRouter>
    );
  });
  await flush();
}

function buttonByText(re: RegExp): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find((b) => re.test(b.textContent || '')) as
    | HTMLButtonElement
    | undefined;
}

async function click(el: HTMLElement | undefined) {
  expect(el).toBeTruthy();
  await act(async () => {
    el!.click();
  });
  await flush();
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('SystemDesign page', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({ activeRepository: '/repos/shop', activeRepositoryId: 9 });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it('shows the empty state, generates a diagram, and lists flows and warnings', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      const u = String(url);
      if (u.includes('/system-design/generate')) {
        expect(JSON.parse(String((init as RequestInit).body)).repository_id).toBe(9);
        return json(DIAGRAM);
      }
      if (u.includes('/system-design')) return json(null);
      return json({});
    });

    await mount();
    await click(buttonByText(/generate diagram/i));

    const text = container.textContent || '';
    expect(text).toContain('Shop system design');
    expect(text).toContain('Open a page');
    expect(text).toContain('Heads up');
    expect(buttonByText(/regenerate/i)).toBeTruthy();
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/system-design/generate'))).toBe(true);
  });

  it('shows an error when generation fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes('/system-design/generate')) return json({ detail: 'System design generation failed.' }, 500);
      if (u.includes('/system-design')) return json(null);
      return json({});
    });
    await mount();
    await click(buttonByText(/generate diagram/i));
    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('System design generation failed.');
  });

  it('asks the user to open a repository first', async () => {
    useWorkspaceStore.setState({ activeRepository: null, activeRepositoryId: null });
    await mount();
    expect(container.textContent).toMatch(/open a repository first/i);
  });
});
