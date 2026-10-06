import { describe, it, expect, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { Overview } from '../pages/Overview';
import { useWorkspaceStore } from '../stores/workspaceStore';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('Phase 2 Overview Dashboard', () => {
  it('renders onboarding and input when no repository is active', async () => {
    act(() => {
      useWorkspaceStore.setState({ activeRepository: null, repositoryInfo: null });
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/']}>
          <Overview />
        </MemoryRouter>
      );
    });

    expect(container.innerHTML).toContain('Repository Overview');
    expect(container.innerHTML).toContain('Repository Folder or GitHub URL');
    expect(container.innerHTML).toContain('Scan Repository');

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('renders comprehensive repository overview when repository is loaded', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/health-score')) {
        return {
          ok: true,
          json: async () => ({
            total_score: 82,
            grade: 'Good',
            summary: 'Codebase adheres to standard architectural guidelines.',
            dimensions: [
              { name: 'Architecture', score: 18, max_score: 20, deductions: [] },
              { name: 'Security', score: 20, max_score: 20, deductions: [] },
              { name: 'Maintainability', score: 16, max_score: 20, deductions: [] },
              { name: 'Complexity', score: 14, max_score: 20, deductions: [] },
              { name: 'Documentation', score: 14, max_score: 20, deductions: [] },
            ],
          }),
        } as any;
      }
      return {
        ok: true,
        json: async () => ({}),
      } as any;
    });

    act(() => {
      useWorkspaceStore.setState({
        activeRepository: 'D:/projects/summer-project-1',
        scanStatus: 'indexed',
        repositoryInfo: {
          path: 'D:/projects/summer-project-1',
          name: 'summer-project-1',
          total_files: 41,
          total_lines: 14418,
          languages: { Python: 35, TypeScript: 6 },
          scanned_at: new Date().toISOString(),
        },
      });
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/']}>
          <Overview />
        </MemoryRouter>
      );
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const html = container.innerHTML;

    // Repository header
    expect(html).toContain('summer-project-1');
    expect(html).toContain('Rescan');
    expect(html).toContain('Open Explorer');
    expect(html).toContain('Ask Assistant');

    // Metrics summary
    expect(html).toContain('Repository Summary');
    expect(html).toContain('41');
    expect(html).toContain('14,418');
    expect(html).toContain('Python');

    // Health summary
    expect(html).toContain('Code Health');
    expect(html).toContain('Architecture');
    expect(html).toContain('Security');
    expect(html).toContain('Maintainability');
    expect(html).toContain('Complexity');
    expect(html).toContain('Documentation');

    // Attention & Quick Actions
    expect(html).toContain('Needs Attention');
    expect(html).toContain('What Can I Do Next?');
    expect(html).toContain('Explore source tree');
    expect(html).toContain('Semantic code search');

    fetchMock.mockRestore();
    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
