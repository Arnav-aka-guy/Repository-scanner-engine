import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchHealthHistory, compareHealthSnapshots } from '../services/healthHistory';
import { getDependencyGraph, getCallGraph, getAnalysis } from '../services/graph';
import { semanticSearch } from '../services/search';
import { getChatHistory, clearChatHistoryApi } from '../services/chat';
import { generateDocumentation } from '../services/documentation';
import { listFiles, getFile } from '../services/repository';

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
});
