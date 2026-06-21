import React, { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';
import { StatusBar } from '../components/StatusBar';
import { useWorkspaceStore } from '../stores/workspaceStore';

const PAGE_TITLES: Record<string, string> = {
  '/': 'Repository Explorer',
  '/graph': 'Dependency Graph',
  '/architecture': 'Architecture Viewer',
  '/search': 'Semantic Search',
  '/chat': 'AI Chat',
  '/docs': 'Documentation',
  '/settings': 'Settings',
};

export const MainLayout: React.FC = () => {
  const location = useLocation();
  const pageTitle = PAGE_TITLES[location.pathname] || 'Antigravity Engine';
  const activeRepository = useWorkspaceStore((s) => s.activeRepository);
  const repositoryInfo = useWorkspaceStore((s) => s.repositoryInfo);
  const scanStatus = useWorkspaceStore((s) => s.scanStatus);
  const scanRepo = useWorkspaceStore((s) => s.scanRepo);

  // On mount, re-scan the active repository if we have one persisted but no info loaded
  useEffect(() => {
    if (activeRepository && !repositoryInfo && scanStatus === 'idle') {
      scanRepo(activeRepository);
    }
  }, [activeRepository, repositoryInfo, scanStatus, scanRepo]);

  return (
    <div
      className="flex flex-col overflow-hidden w-screen h-screen font-sans relative"
      style={{ zIndex: 1 }}
    >
      {/* Main horizontal layout: Sidebar + Page content */}
      <div className="flex-1 flex overflow-hidden w-full">
        {/* Left Vertical Activity Bar */}
        <Sidebar />

        {/* Dynamic Page Content */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
          {/* Top Page Title Bar */}
          <div
            className="px-6 py-2 flex items-center gap-3 select-none border-b"
            style={{
              background: 'rgba(10, 10, 18, 0.6)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              borderColor: 'var(--border-color)',
              minHeight: '36px',
            }}
          >
            <div
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background: 'var(--accent-primary)',
                boxShadow: '0 0 6px var(--accent-primary)',
              }}
            />
            <span
              className="text-[11px] font-semibold uppercase tracking-[0.15em] font-mono"
              style={{ color: 'var(--text-muted)' }}
            >
              {pageTitle}
            </span>
            {activeRepository && (
              <span
                className="text-[10px] font-mono ml-auto truncate max-w-[300px]"
                style={{ color: 'var(--text-muted)' }}
              >
                {activeRepository}
              </span>
            )}
          </div>

          {/* Page Outlet — no context needed, pages use Zustand directly */}
          <Outlet />
        </div>
      </div>

      {/* Bottom Status bar */}
      <StatusBar
        repoPath={activeRepository || ''}
        totalFiles={repositoryInfo?.total_files || 0}
        totalLines={repositoryInfo?.total_lines || 0}
      />
    </div>
  );
};
