import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { ChangeImpact } from '../pages/ChangeImpact';
import { CodeReview } from '../pages/CodeReview';
import * as impactService from '../services/impact';
import * as reviewService from '../services/review';
import { useWorkspaceStore } from '../stores/workspaceStore';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

describe('V2.1 Frontend Features', () => {
  let container: HTMLDivElement;
  let root: Root;

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

  it('renders Change Impact page and executes analysis', async () => {
    act(() => {
      useWorkspaceStore.setState({
        activeRepository: 'D:/test/repo',
        files: [
        {
          path: 'backend/api/auth.py',
          name: 'auth.py',
          extension: '.py',
          size_bytes: 100,
          line_count: 10,
          language: 'python',
        },
      ],
      });
    });

    const mockReport: impactService.ImpactReport = {
      target_files: ['backend/api/auth.py'],
      target_symbols: ['verify_token'],
      risk_score: 65,
      risk_level: 'High',
      risk_factors: ['Touches authentication logic', 'Affects 2 API routes'],
      directly_affected_modules: [
        {
          file_path: 'backend/main.py',
          reason: 'Direct import of verify_token',
          imported_symbols: ['verify_token'],
        },
      ],
      indirectly_affected_modules: [],
      affected_callers: ['login_endpoint'],
      affected_callees: ['decode_jwt'],
      shared_classes: [],
      api_consumers: ['backend/api/users.py'],
      recommended_tests: ['tests/test_auth.py'],
      regression_risks: ['Authentication bypass regression risk'],
      total_affected_count: 3,
    };

    vi.spyOn(impactService, 'analyzeChangeImpact').mockResolvedValue(mockReport);

    await act(async () => {
      root.render(
        <MemoryRouter>
          <ChangeImpact />
        </MemoryRouter>
      );
    });

    expect(container.textContent).toContain('Change Impact Analysis');
    expect(container.textContent).toContain('V2.1 ENGINE');

    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    expect(input).not.toBeNull();

    await act(async () => {
      input.value = 'backend/api/auth.py';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    const analyzeBtn = buttons.find((b) => b.textContent?.includes('Analyze Impact'));
    expect(analyzeBtn).toBeDefined();

    await act(async () => {
      analyzeBtn?.click();
    });

    expect(container.textContent).toContain('65');
    expect(container.textContent).toContain('High Risk');
    expect(container.textContent).toContain('backend/main.py');

    // Switch to API Consumers tab
    const consumerTabBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('API Consumers')
    );
    expect(consumerTabBtn).toBeDefined();

    await act(async () => {
      consumerTabBtn?.click();
    });

    expect(container.textContent).toContain('backend/api/users.py');
  });

  it('renders Code Review page and triggers analysis', async () => {
    act(() => {
      useWorkspaceStore.setState({ activeRepository: 'D:/test/repo' });
    });

    const mockReviewResponse: reviewService.CodeReviewResponse = {
      files_reviewed: ['services/auth.py'],
      total_findings: 1,
      critical_count: 1,
      high_count: 0,
      medium_count: 0,
      low_count: 0,
      findings: [
        {
          file_path: 'services/auth.py',
          line_start: 12,
          line_end: 12,
          severity: 'critical',
          category: 'security',
          title: 'Potential SQL Injection Vulnerability',
          explanation: 'Dynamic string interpolation into SQL query without parameters.',
          evidence: 'db.execute(f"SELECT * FROM users WHERE id = \'{token}\'")',
          suggested_fix: 'Use parameterized queries: db.execute("SELECT * FROM users WHERE id = :token", {"token": token})',
          confidence: 0.98,
          source: 'static_analyzer',
        },
      ],
      summary: 'Reviewed 1 changed file. Found 1 issue.',
      deterministic_mode: true,
    };

    vi.spyOn(reviewService, 'runCodeReview').mockResolvedValue(mockReviewResponse);

    await act(async () => {
      root.render(
        <MemoryRouter>
          <CodeReview />
        </MemoryRouter>
      );
    });

    expect(container.textContent).toContain('Automated Code Review');
    expect(container.textContent).toContain('V2.1 ENGINE');

    const buttons = Array.from(container.querySelectorAll('button'));
    const reviewBtn = buttons.find((b) => b.textContent?.includes('Run Code Review'));
    expect(reviewBtn).toBeDefined();

    await act(async () => {
      reviewBtn?.click();
    });

    expect(container.textContent).toContain('Potential SQL Injection Vulnerability');
    expect(container.textContent).toContain('services/auth.py:12');
    expect(container.textContent).toContain('Confidence: 98%');
  });
});
