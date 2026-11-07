import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchHealthHistory, compareHealthSnapshots } from '../services/healthHistory';
import { getDependencyGraph, getCallGraph, getAnalysis } from '../services/graph';
import { semanticSearch } from '../services/search';
import { getChatHistory, clearChatHistoryApi } from '../services/chat';
import { generateDocumentation } from '../services/documentation';
import { listFiles, getFile, getOnboardingGuide } from '../services/repository';
import { analyzeChangeImpact, exportChangeImpact } from '../services/impact';
import { runCodeReview } from '../services/review';

describe('B7 & B8 Service Parameter Construction', () => {
  let capturedUrl: string | null = null;
  let capturedOptions: RequestInit | undefined = undefined;

  beforeEach(() => {
    capturedUrl = null;
    capturedOptions = undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any, options?: RequestInit) => {
      capturedUrl = String(url);
      capturedOptions = options;
      return {
        ok: true,
        json: async () => ({}),
      } as any;
    });
  });

  it('fetchHealthHistory prefers repository_id over repo_path and avoids legacy "path" param', async () => {
    await fetchHealthHistory('/my/repo', 42);
    expect(capturedUrl).toContain('/health-score/history?repository_id=42');
    expect(capturedUrl).not.toMatch(/[?&]path=/);

    await fetchHealthHistory('/my/repo');
    expect(capturedUrl).toContain('/health-score/history?repo_path=%2Fmy%2Frepo');
    expect(capturedUrl).not.toMatch(/[?&]path=/);
  });

  it('compareHealthSnapshots sends repo_path and baseline/current IDs correctly', async () => {
    await compareHealthSnapshots('/my/repo', 'snap1', 'snap2', 42);
    expect(capturedUrl).toContain('repository_id=42');
    expect(capturedUrl).toContain('baseline_id=snap1');
    expect(capturedUrl).toContain('current_id=snap2');
    expect(capturedUrl).not.toMatch(/[?&]path=/);

    await compareHealthSnapshots('/my/repo', 'snap1', 'snap2');
    expect(capturedUrl).toContain('repo_path=%2Fmy%2Frepo');
    expect(capturedUrl).toContain('baseline_id=snap1');
    expect(capturedUrl).toContain('current_id=snap2');
  });

  it('graph service functions pass repository_id or repo_path', async () => {
    await getDependencyGraph('/my/repo', 42);
    expect(capturedUrl).toContain('/graph/dependency?repository_id=42');

    await getCallGraph('/my/repo', 42);
    expect(capturedUrl).toContain('/graph/call?repository_id=42');

    await getAnalysis('/my/repo', 42);
    expect(capturedUrl).toContain('/graph/analysis?repository_id=42');
  });

  it('semanticSearch sends repository_id in JSON payload', async () => {
    await semanticSearch('function test', 10, '/my/repo', 42);
    expect(capturedUrl).toContain('/search/');
    const body = JSON.parse(capturedOptions?.body as string);
    expect(body).toEqual({
      query: 'function test',
      top_k: 10,
      repository_id: 42,
    });
  });

  it('chat service functions send repository_id in query and payload', async () => {
    await getChatHistory('/my/repo', 'conv-123', 42);
    expect(capturedUrl).toContain('/chat/history');
    expect(capturedUrl).toContain('repository_id=42');
    expect(capturedUrl).toContain('conversation_id=conv-123');

    await clearChatHistoryApi('/my/repo', 'conv-123', 42);
    expect(capturedUrl).toContain('/chat/history');
    expect(capturedUrl).toContain('repository_id=42');
    expect(capturedUrl).toContain('conversation_id=conv-123');
  });

  it('generateDocumentation sends repository_id in payload', async () => {
    await generateDocumentation('/my/repo', 'markdown', 42);
    expect(capturedUrl).toContain('/documentation/generate');
    const body = JSON.parse(capturedOptions?.body as string);
    expect(body).toEqual({
      format: 'markdown',
      repository_id: 42,
    });
  });

  it('repository service listFiles and getFile pass repository_id', async () => {
    await listFiles('/my/repo', 42);
    expect(capturedUrl).toContain('/repository/files?repository_id=42');

    await getFile('src/index.ts', '/my/repo', 42);
    expect(capturedUrl).toContain('/repository/file/src/index.ts?repository_id=42');
  });

  it('getOnboardingGuide sends repository_id and repo_path query params', async () => {
    await getOnboardingGuide('/my/repo', 42);
    expect(capturedUrl).toContain('/repository/onboarding');
    expect(capturedUrl).toContain('repository_id=42');
    expect(capturedUrl).toContain('repo_path=%2Fmy%2Frepo');

    await getOnboardingGuide('', 42);
    expect(capturedUrl).toContain('/repository/onboarding?repository_id=42');
  });

  it('analyzeChangeImpact and exportChangeImpact send repository_id in body', async () => {
    await analyzeChangeImpact('/my/repo', ['file.ts'], ['sym'], 42);
    expect(capturedUrl).toContain('/impact/analyze');
    let body = JSON.parse(capturedOptions?.body as string);
    expect(body).toEqual({
      target_files: ['file.ts'],
      target_symbols: ['sym'],
      repository_id: 42,
      repo_path: '/my/repo',
    });

    await exportChangeImpact('/my/repo', ['file.ts'], ['sym'], 'markdown', 42);
    expect(capturedUrl).toContain('/impact/export?format=markdown');
    body = JSON.parse(capturedOptions?.body as string);
    expect(body.repository_id).toBe(42);
  });

  it('runCodeReview sends repository_id in body', async () => {
    await runCodeReview('/my/repo', 'diff...', false, 42);
    expect(capturedUrl).toContain('/review/analyze');
    const body = JSON.parse(capturedOptions?.body as string);
    expect(body).toEqual({
      diff_text: 'diff...',
      use_llm: false,
      repository_id: 42,
      repo_path: '/my/repo',
    });
  });
});