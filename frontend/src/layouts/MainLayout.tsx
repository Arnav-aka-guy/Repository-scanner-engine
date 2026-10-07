import React, { useEffect, useState } from 'react';
import { Outlet, useLocation, Link } from 'react-router-dom';
import { Menu, Search, RefreshCw, Folder, FolderOpen, ChevronDown } from 'lucide-react';
import { Sidebar } from '../components/Sidebar';
import { StatusBar } from '../components/StatusBar';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { CommandPalette } from '../components/CommandPalette';
import { RepositoryModal } from '../components/RepositoryModal';
import { RepositorySwitcher } from '../components/RepositorySwitcher';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { colors, radius, font } from '../design-system/tokens';
import { getUserRepository } from '../services/repository';

function getPageTitle(pathname: string): string {
  if (pathname.endsWith('/explorer')) return 'Explorer';
  if (pathname.endsWith('/graph')) return 'Dependencies';
  if (pathname.endsWith('/architecture')) return 'Architecture';
  if (pathname.endsWith('/search')) return 'Search';
  if (pathname.endsWith('/chat')) return 'Assistant';
  if (pathname.endsWith('/documentation')) return 'Documentation';
  if (pathname.endsWith('/health-dashboard')) return 'Code Health';
  if (pathname.endsWith('/settings')) return 'Settings';
  if (pathname.endsWith('/overview')) return 'Overview';
  return 'Workspace';
}

function getRepoBasename(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  return segments[segments.length - 1] || path;
}

export const MainLayout: React.FC = () => {
  const location = useLocation();
  const pageTitle = getPageTitle(location.pathname);

  const activeRepository = useWorkspaceStore((s) => s.activeRepository);
  const repositoryInfo = useWorkspaceStore((s) => s.repositoryInfo);
  const scanStatus = useWorkspaceStore((s) => s.scanStatus);
  const scanRepo = useWorkspaceStore((s) => s.scanRepo);
  const setRepoModalOpen = useWorkspaceStore((s) => s.setRepoModalOpen);

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  // Sync URL repositoryId if present
  useEffect(() => {
    const match = location.pathname.match(/\/app\/repositories\/(\d+)/);
    if (match) {
      const repoId = parseInt(match[1], 10);
      getUserRepository(repoId)
        .then((repo) => {
          if (repo && repo.source_path && repo.source_path !== activeRepository) {
            scanRepo(repo.source_path);
          }
        })
        .catch(() => {});
    }
  }, [location.pathname]);

  // On mount, re-scan the active repository if persisted but not loaded
  useEffect(() => {
    if (activeRepository && !repositoryInfo && scanStatus === 'idle') {
      scanRepo(activeRepository);
    }
  }, [activeRepository, repositoryInfo, scanStatus, scanRepo]);

  // Global keyboard listener for Ctrl+K / Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const repoName = activeRepository ? getRepoBasename(activeRepository) : null;
  const isScanning = scanStatus === 'scanning';

  const getStatusBadge = () => {
    switch (scanStatus) {
      case 'indexed':
        return { text: 'Indexed', color: colors.status.success };
      case 'scanning':
        return { text: 'Scanning...', color: colors.accent.blue };
      case 'error':
        return { text: 'Scan error', color: colors.status.danger };
      default:
        return { text: 'Idle', color: colors.text.muted };
    }
  };

  const statusBadge = getStatusBadge();

  return (
    <div
      className="flex flex-col overflow-hidden w-screen h-screen font-sans relative"
      style={{
        backgroundColor: colors.bg.primary,
        color: colors.text.primary,
      }}
    >
      {/* Main horizontal layout: Sidebar + Main Content Column */}
      <div className="flex-1 flex overflow-hidden w-full">
        {/* Left Sidebar */}
        <Sidebar
          isMobileOpen={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
        />

        {/* Right Main Column (Top Bar + Dynamic Viewport + Status Bar) */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
          {/* ── Top Bar ── */}
          <header
            style={{
              height: '42px',
              minHeight: '42px',
              backgroundColor: colors.bg.surface,
              borderBottom: `1px solid ${colors.border.default}`,
              padding: '0 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px',
              userSelect: 'none',
              flexShrink: 0,
              zIndex: 30,
            }}
          >
            {/* Left section: Hamburger (mobile) + Repository Context Breadcrumb */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
              {/* Mobile hamburger toggle */}
              <button
                onClick={() => setIsMobileSidebarOpen(true)}
                className="md:hidden p-1 rounded hover:bg-[#1B2028]"
                style={{ color: colors.text.muted }}
                aria-label="Open navigation menu"
              >
                <Menu size={18} />
              </button>

              {/* Product & Repository Breadcrumbs */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                <Link
                  to="/app"
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: colors.text.secondary,
                    fontFamily: font.sans,
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = colors.accent.blue)}
                  onMouseLeave={(e) => (e.currentTarget.style.color = colors.text.secondary)}
                >
                  <span>Repositories</span>
                </Link>

                <span style={{ color: colors.border.strong, fontSize: '13px' }}>/</span>

                <RepositorySwitcher />

                {/* Status indicator pill */}
                {activeRepository && (
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '1px 7px',
                      borderRadius: radius.sm,
                      backgroundColor: colors.bg.surfaceSecondary,
                      border: `1px solid ${colors.border.subtle}`,
                      fontSize: '11px',
                      fontFamily: font.sans,
                      color: statusBadge.color,
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        width: '5px',
                        height: '5px',
                        borderRadius: '50%',
                        backgroundColor: statusBadge.color,
                        flexShrink: 0,
                      }}
                    />
                    <span>{statusBadge.text}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Center section: Command Palette Quick Trigger */}
            <div style={{ display: 'flex', justifyContent: 'center', flex: 1, maxWidth: '420px' }}>
              <button
                onClick={() => setIsCommandPaletteOpen(true)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '5px 12px',
                  backgroundColor: colors.bg.primary,
                  border: `1px solid ${colors.border.default}`,
                  borderRadius: radius.md,
                  color: colors.text.muted,
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontFamily: font.sans,
                  transition: 'border-color 0.12s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = colors.accent.blue)}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = colors.border.default)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Search size={13} style={{ color: colors.text.muted }} />
                  <span>Search or run command...</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <kbd
                    style={{
                      padding: '1px 5px',
                      fontSize: '10px',
                      fontFamily: font.mono,
                      backgroundColor: colors.bg.elevated,
                      border: `1px solid ${colors.border.subtle}`,
                      borderRadius: radius.sm,
                      color: colors.text.secondary,
                    }}
                  >
                    Ctrl K
                  </kbd>
                </div>
              </button>
            </div>

            {/* Right section: Active Route Title & Actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 500,
                  color: colors.text.secondary,
                  fontFamily: font.sans,
                }}
              >
                {pageTitle}
              </span>

              <button
                onClick={() => setRepoModalOpen(true)}
                disabled={isScanning}
                title="Switch or open repository"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '3px 8px',
                  backgroundColor: colors.bg.surfaceSecondary,
                  border: `1px solid ${colors.border.default}`,
                  borderRadius: radius.md,
                  color: colors.text.secondary,
                  fontSize: '11px',
                  fontFamily: font.sans,
                  cursor: isScanning ? 'not-allowed' : 'pointer',
                }}
              >
                <FolderOpen size={11} style={{ color: colors.accent.blue }} />
                <span>Switch Repo</span>
              </button>

              {activeRepository && (
                <button
                  onClick={() => scanRepo(activeRepository)}
                  disabled={isScanning}
                  title="Rescan repository"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '3px 8px',
                    backgroundColor: colors.bg.surfaceSecondary,
                    border: `1px solid ${colors.border.default}`,
                    borderRadius: radius.md,
                    color: isScanning ? colors.accent.blue : colors.text.secondary,
                    fontSize: '11px',
                    fontFamily: font.sans,
                    cursor: isScanning ? 'not-allowed' : 'pointer',
                  }}
                >
                  <RefreshCw
                    size={11}
                    style={{
                      animation: isScanning ? 'ds-spin 1s linear infinite' : 'none',
                    }}
                  />
                  <span>Rescan</span>
                </button>
              )}
            </div>
          </header>

          {/* Dynamic Page Outlet */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </div>
        </div>
      </div>

      {/* Bottom Status bar */}
      <StatusBar
        repoPath={activeRepository || ''}
        totalFiles={repositoryInfo?.total_files || 0}
        totalLines={repositoryInfo?.total_lines || 0}
      />

      {/* Lightweight Command Palette Dialog */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
      />

      {/* Global Repository Switcher / Opener Modal */}
      <RepositoryModal />
    </div>
  );
};
