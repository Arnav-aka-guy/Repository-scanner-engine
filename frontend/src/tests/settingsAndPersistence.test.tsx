import { describe, it, expect, beforeEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { Settings } from '../pages/Settings';
import { ErrorCard } from '../components/ErrorCard';
import { useWorkspaceStore } from '../stores/workspaceStore';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// Mock API calls
vi.mock('../services/api', () => ({
  apiGet: vi.fn(async (path: string) => {
    if (path === '/settings/providers') {
      return {
        providers: [
          { name: 'ollama', model: 'llama3', active: true },
          { name: 'groq', model: 'openai/gpt-oss-120b', active: false },
        ],
        active_provider: 'ollama',
      };
    }
    if (path === '/settings/ai-health') {
      return {
        status: 'ok',
        provider: 'ollama',
        message: 'Provider responding. Response: OK',
      };
    }
    return {};
  }),
  apiPost: vi.fn(async () => ({})),
  apiDelete: vi.fn(async () => ({ status: 'cleared', message: 'Chat history cleared' })),
}));

describe('Phase 11: Settings, Providers & Error UX', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    act(() => {
      useWorkspaceStore.setState({
        activeRepository: 'D:/projects/my-repo',
        recentRepositories: ['D:/projects/my-repo', 'D:/projects/old-repo'],
        chatMessages: [],
      });
    });
  });

  it('renders all 5 Phase 11 settings sections in the navigation sidebar', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <MemoryRouter>
          <Settings />
        </MemoryRouter>
      );
    });

    expect(container.textContent).toContain('AI Providers');
    expect(container.textContent).toContain('Workspace');
    expect(container.textContent).toContain('Appearance');
    expect(container.textContent).toContain('Data');
    expect(container.textContent).toContain('Advanced');
  });

  it('renders provider badges with local vs cloud AI and privacy guarantees', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <MemoryRouter>
          <Settings />
        </MemoryRouter>
      );
    });

    expect(container.textContent).toContain('ollama');
    expect(container.textContent).toContain('groq');
    expect(container.textContent).toContain('Local AI');
    expect(container.textContent).toContain('Cloud AI');
    expect(container.textContent).toContain('Privacy guarantee: Runs 100% on your computer');
    expect(container.textContent).toContain('Requires an API key and sends retrieved codebase context');
  });

  it('switches to Workspace and Data tabs displaying storage locations', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <MemoryRouter>
          <Settings />
        </MemoryRouter>
      );
    });

    // Find and click the Workspace tab button
    const buttons = Array.from(container.querySelectorAll('button'));
    const workspaceBtn = buttons.find((b) => b.textContent?.includes('Workspace'));
    expect(workspaceBtn).toBeDefined();

    await act(async () => {
      workspaceBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Workspace & Repositories');
    expect(container.textContent).toContain('D:/projects/my-repo');
    expect(container.textContent).toContain('D:/projects/old-repo');

    // Find and click Data tab button
    const dataBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Data'));
    expect(dataBtn).toBeDefined();

    await act(async () => {
      dataBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Storage & Data Management');
    expect(container.textContent).toContain('data/scan_jobs.json');
    expect(container.textContent).toContain('data/chat_conversations.json');
    expect(container.textContent).toContain('Zero external dependencies');
  });

  it('renders ErrorCard with structured 3-part UX (What happened, Why, What can I do) and Retry', async () => {
    const handleRetry = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ErrorCard
          title="Analysis Server Offline"
          whatHappened="The backend stopped responding while building the dependency graph."
          why="Connection to http://127.0.0.1:8000 was refused."
          whatCanIDo="Restart the FastAPI backend server using uvicorn."
          onRetry={handleRetry}
        />
      );
    });

    expect(container.textContent).toContain('Analysis Server Offline');
    expect(container.textContent).toContain('What happened?');
    expect(container.textContent).toContain('Why?');
    expect(container.textContent).toContain('What can I do?');
    expect(container.textContent).toContain('stopped responding while building the dependency graph');

    const retryBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Retry'));
    expect(retryBtn).toBeDefined();

    await act(async () => {
      retryBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(handleRetry).toHaveBeenCalledTimes(1);
  });
});
