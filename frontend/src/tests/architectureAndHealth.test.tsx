import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { ArchitectureViewer } from '../pages/ArchitectureViewer';
import { HealthDashboard } from '../pages/HealthDashboard';
import { useWorkspaceStore } from '../stores/workspaceStore';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('Phase 7 Architecture Health Redesign', () => {
  let container: HTMLDivElement;
  let root: any;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  it('renders architecture health score, why this score breakdown, layers, and violations', async () => {
    const mockReport = {
      score: 82,
      summary: 'Clear layer separation and no circular dependencies.',
      stats: {
        total_layers: 4,
        total_circular_deps: 0,
        total_dead_code: 2,
        total_violations: 1,
      },
      layers: {
        Presentation: ['src/components/Header.tsx'],
        Services: ['src/services/api.ts'],
        Infrastructure: ['backend/db/database.py'],
        Unclassified: ['scripts/deploy.sh'],
      },
      circular_dependencies: [],
      violations: [
        {
          source_file: 'src/lib/newsapi.ts',
          target_file: 'src/components/Header.tsx',
          source_layer: 'Services',
          target_layer: 'Presentation',
          description: 'Module is imported by 12 other modules.',
          severity: 'High coupling',
        },
      ],
      strengths: ['No circular loops'],
      problems: ['1 boundary violation'],
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/architecture/report')) {
        return {
          ok: true,
          json: async () => mockReport,
        } as any;
      }
      return {
        ok: true,
        json: async () => ({}),
      } as any;
    });

    act(() => {
      useWorkspaceStore.setState({
        activeRepository: 'd:/projects/demo-repo',
      });
    });

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/architecture']}>
          <ArchitectureViewer />
        </MemoryRouter>
      );
    });

    // Wait for fetch
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });

    // Header & plain english copy
    expect(container.innerHTML).toContain('Architecture Health');
    expect(container.innerHTML).toContain('Checks how the major parts of your project are organized and connected');

    // Score & why this score
    expect(container.innerHTML).toContain('82');
    expect(container.innerHTML).toContain('Good');
    expect(container.innerHTML).toContain('Why this score?');

    // Layers (expandable sections)
    expect(container.innerHTML).toContain('Presentation');
    expect(container.innerHTML).toContain('Services');
    expect(container.innerHTML).toContain('Infrastructure');
    expect(container.innerHTML).toContain('Unclassified');

    // Relative file paths in violations
    expect(container.innerHTML).toContain('src/lib/newsapi.ts');
    expect(container.innerHTML).toContain('Why it matters:');
    expect(container.innerHTML).toContain('Open file');
  });
});

describe('Phase 8 Code Health and Technical Debt Redesign', () => {
  let container: HTMLDivElement;
  let root: any;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  it('renders overall health, 5 dimensions, prioritized issues, and recommended actions', async () => {
    const mockHealthScore = {
      total_score: 79,
      grade: 'B',
      summary: 'Maintenance hotspots identified in utility modules.',
      dimensions: [
        { name: 'Documentation', score: 14, max_score: 20, deductions: [] },
        { name: 'Complexity', score: 16, max_score: 20, deductions: [] },
        { name: 'Architecture', score: 18, max_score: 20, deductions: [] },
        { name: 'Maintainability', score: 15, max_score: 20, deductions: [] },
        { name: 'Security', score: 16, max_score: 20, deductions: [] },
      ],
    };

    const mockTechDebt = {
      total_debt_score: 42,
      debt_rating: 'Moderate',
      total_smells: 8,
      smells_by_category: { documentation: 5, complexity: 3 },
      smells_by_severity: { high: 2, medium: 6 },
      suggestions: ['Add missing docstrings.'],
      top_offenders: [{ path: 'src/lib/newsapi.ts', debt_score: 18, smell_count: 4 }],
      all_smells: [
        {
          category: 'documentation',
          severity: 'high',
          file_path: 'src/lib/newsapi.ts',
          entity_name: 'fetchNews',
          line: 42,
          message: '6 public functions do not have documentation.',
          suggestion: 'Add documentation for parameter types and response models.',
        },
      ],
    };

    const mockDepRisk = {
      total_dependencies: 12,
      python_deps: 8,
      node_deps: 4,
      pinning_score: 90,
      risk_summary: {},
      suggestions: [],
      dependencies: [],
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/health-score')) {
        return { ok: true, json: async () => mockHealthScore } as any;
      }
      if (urlStr.includes('/tech-debt')) {
        return { ok: true, json: async () => mockTechDebt } as any;
      }
      if (urlStr.includes('/dependency-risk')) {
        return { ok: true, json: async () => mockDepRisk } as any;
      }
      return { ok: true, json: async () => ({}) } as any;
    });

    act(() => {
      useWorkspaceStore.setState({
        activeRepository: 'd:/projects/demo-repo',
      });
    });

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/health-dashboard']}>
          <HealthDashboard />
        </MemoryRouter>
      );
    });

    // Wait for fetch
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });

    // Header & overall health
    expect(container.innerHTML).toContain('Code Health &amp; Technical Debt');
    expect(container.innerHTML).toContain('79');
    expect(container.innerHTML).toContain('Needs Review');

    // 5 dimensions
    expect(container.innerHTML).toContain('Documentation');
    expect(container.innerHTML).toContain('Complexity');
    expect(container.innerHTML).toContain('Architecture');
    expect(container.innerHTML).toContain('Maintainability');
    expect(container.innerHTML).toContain('Security');

    // Prioritized issues
    expect(container.innerHTML).toContain('High');
    expect(container.innerHTML).toContain('fetchNews');
    expect(container.innerHTML).toContain('src/lib/newsapi.ts');
    expect(container.innerHTML).toContain('Why it matters:');
    expect(container.innerHTML).toContain('Suggested action:');
    expect(container.innerHTML).toContain('Open file');
  });
});
