import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { AIChat } from '../pages/AIChat';
import { DocumentationGenerator } from '../pages/DocumentationGenerator';
import { useWorkspaceStore } from '../stores/workspaceStore';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('Phase 9 Repository-Aware AI Assistant Redesign', () => {
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

  it('renders repository assistant header, starter questions, and context panel', async () => {
    act(() => {
      useWorkspaceStore.setState({
        activeRepository: 'd:/projects/demo-repo',
        chatMessages: [],
        repositoryInfo: {
          path: 'd:/projects/demo-repo',
          name: 'demo-repo',
          total_files: 10,
          total_lines: 1200,
          languages: { TypeScript: 10 },
          scanned_at: new Date().toISOString(),
        },
      });
    });

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/chat']}>
          <AIChat />
        </MemoryRouter>
      );
    });

    // Positioning and header
    expect(container.innerHTML).toContain('Repository Assistant');
    expect(container.innerHTML).toContain('Ask questions about this codebase');

    // Starter questions
    expect(container.innerHTML).toContain('Explain this repository');
    expect(container.innerHTML).toContain('Where does the application start?');
    expect(container.innerHTML).toContain('How does authentication work?');
    expect(container.innerHTML).toContain('What are the most important files?');
    expect(container.innerHTML).toContain('What should I fix first?');
    expect(container.innerHTML).toContain('How does data flow through the application?');

    // Context Panel
    expect(container.innerHTML).toContain('Context Used');
    expect(container.innerHTML).toContain('Repository Grounded');
  });

  it('renders grounded sources in assistant response', async () => {
    const mockMessages = [
      {
        id: 'msg-1',
        role: 'user' as const,
        content: 'Where is authentication handled?',
        timestamp: '10:00 AM',
      },
      {
        id: 'msg-2',
        role: 'assistant' as const,
        content: 'Authentication is handled in `backend/security/auth.py` through `get_current_user`. The frontend calls this via `src/services/api.ts`.',
        timestamp: '10:01 AM',
        sources: [
          {
            file_path: 'backend/security/auth.py',
            entity_name: 'get_current_user',
            entity_type: 'function',
            score: 0.85,
            source_code: 'def get_current_user()...',
            docstring: '',
            start_line: 1,
            end_line: 10,
          },
        ],
      },
    ];

    act(() => {
      useWorkspaceStore.setState({
        activeRepository: 'd:/projects/demo-repo',
        chatMessages: mockMessages,
      });
    });

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/chat']}>
          <AIChat />
        </MemoryRouter>
      );
    });

    // Grounded sources section
    expect(container.innerHTML).toContain('Grounded Sources');
    expect(container.innerHTML).toContain('auth.py');
  });
});

describe('Phase 10 Documentation Workspace Redesign', () => {
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

  it('renders documentation sections (Overview, Architecture, API Reference, Dependency Map, Modules)', async () => {
    act(() => {
      useWorkspaceStore.setState({
        activeRepository: 'd:/projects/demo-repo',
        repositoryInfo: {
          path: 'd:/projects/demo-repo',
          name: 'demo-repo',
          total_files: 5,
          total_lines: 600,
          languages: { TypeScript: 5 },
          scanned_at: new Date().toISOString(),
        },
      });
    });

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/documentation']}>
          <DocumentationGenerator />
        </MemoryRouter>
      );
    });

    // Header & Workspace Title
    expect(container.innerHTML).toContain('Documentation Workspace');

    // Section Navigation
    expect(container.innerHTML).toContain('Overview');
    expect(container.innerHTML).toContain('Architecture');
    expect(container.innerHTML).toContain('API Reference');
    expect(container.innerHTML).toContain('Dependency Map');
    expect(container.innerHTML).toContain('Modules');
  });
});
