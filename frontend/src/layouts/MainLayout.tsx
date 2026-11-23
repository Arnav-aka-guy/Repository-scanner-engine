import React, { useEffect, useState, useRef, Suspense } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Outlet, useLocation, Link, useNavigate } from 'react-router-dom';
import { Menu, Search, RefreshCw, FolderOpen } from 'lucide-react';
import { Sidebar } from '../components/Sidebar';
import { StatusBar } from '../components/StatusBar';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { CommandPalette } from '../components/CommandPalette';
import { RepositoryModal } from '../components/RepositoryModal';
import { RepositorySwitcher } from '../components/RepositorySwitcher';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { getUserRepository } from '../services/repository';

function getPageTitle(pathname: string): string {
  if (pathname.endsWith('/explorer')) return 'Explorer';
  if (pathname.endsWith('/graph')) return 'Dependencies';
  if (pathname.endsWith('/architecture')) return 'Architecture';
  if (pathname.endsWith('/system-design')) return 'System Design';
  if (pathname.endsWith('/search')) return 'Search';
  if (pathname.endsWith('/chat')) return 'Assistant';
  if (pathname.endsWith('/documentation')) return 'Documentation';
  if (pathname.endsWith('/health-dashboard')) return 'Code Health';
  if (pathname.endsWith('/settings')) return 'Settings';
  if (pathname.endsWith('/impact')) return 'Change Impact';
  if (pathname.endsWith('/review')) return 'Code Review';
  if (pathname.endsWith('/overview')) return 'Overview';
  return 'Workspace';
}

const PageFallback: React.FC = () => (
  <div className="flex-1 flex items-center justify-center min-h-[200px]">
    <div className="flex items-center gap-2.5 text-[13px] text-fg-3">
      <span className="h-1.5 w-1.5 rounded-full bg-ion live-dot" />
      <span>Loading page…</span>
    </div>
  </div>
);

export const MainLayout: React.FC = () => {
  const location = useLocation();
  const shouldReduceMotion = useReducedMotion();
  const pageTitle = getPageTitle(location.pathname);

  const activeRepository = useWorkspaceStore((s) => s.activeRepository);
  const repositoryInfo = useWorkspaceStore((s) => s.repositoryInfo);
  const scanStatus = useWorkspaceStore((s) => s.scanStatus);
  const scanRepo = useWorkspaceStore((s) => s.scanRepo);
  const setRepoModalOpen = useWorkspaceStore((s) => s.setRepoModalOpen);

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  const navigate = useNavigate();
  const clearWorkspace = useWorkspaceStore((s) => s.clearWorkspace);
  const activeRepositoryId = useWorkspaceStore((s) => s.activeRepositoryId);
  const openRepository = useWorkspaceStore((s) => s.openRepository);
  const lastFetchedRepoId = useRef<number | null>(null);
  const isInitialMount = useRef(true);

  // Centralized route-based repository sync with dedup
  useEffect(() => {
    const match = location.pathname.match(/\/app\/repositories\/(\d+)/);
    const urlRepoId = match ? parseInt(match[1], 10) : null;

    if (!urlRepoId) {
      if (!activeRepositoryId) {
        navigate('/app', { replace: true });
      }
      return;
    }

    if (isInitialMount.current) {
      isInitialMount.current = false;
      lastFetchedRepoId.current = urlRepoId;

      getUserRepository(urlRepoId)
        .then((repo) => {
          if (repo) {
            openRepository(repo);
          } else {
            clearWorkspace();
            navigate('/app', { replace: true });
          }
        })
        .catch(() => {
          clearWorkspace();
          navigate('/app', { replace: true });
        });
      return;
    }

    // Subsequent route navigation: if same repo as already active or already fetching, skip
    if (activeRepositoryId === urlRepoId || lastFetchedRepoId.current === urlRepoId) {
      return;
    }

    lastFetchedRepoId.current = urlRepoId;

    getUserRepository(urlRepoId)
      .then((repo) => {
        if (repo) {
          openRepository(repo);
        } else {
          clearWorkspace();
          navigate('/app', { replace: true });
        }
      })
      .catch(() => {
        clearWorkspace();
        navigate('/app', { replace: true });
      });
  }, [location.pathname, activeRepositoryId, openRepository, clearWorkspace, navigate]);

  // On mount, only request scan info if active repository exists and we are not scanning
  useEffect(() => {
    // We do NOT blindly trigger scanRepo on route changes or component mounts
    // Scans should only be triggered explicitly by user action or initial repository onboarding
  }, []);

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

  const isScanning = scanStatus === 'scanning';

  const statusBadge =
    scanStatus === 'indexed'
      ? { text: 'Indexed', cls: 'text-mint', dot: 'bg-mint' }
      : scanStatus === 'scanning'
        ? { text: 'Scanning…', cls: 'text-ion', dot: 'bg-ion live-dot' }
        : scanStatus === 'error'
          ? { text: 'Scan failed', cls: 'text-rose', dot: 'bg-rose' }
          : { text: 'Not scanned', cls: 'text-fg-3', dot: 'bg-fg-4' };

  return (
    <div className="relative flex h-[100dvh] w-screen flex-col overflow-hidden bg-ink font-sans text-fg">
      <div className="flex w-full flex-1 overflow-hidden">
        <Sidebar isMobileOpen={isMobileSidebarOpen} onCloseMobile={() => setIsMobileSidebarOpen(false)} />

        <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="relative z-30 flex h-[52px] min-h-[52px] shrink-0 select-none items-center justify-between gap-3 border-b border-line bg-ink/90 px-3 backdrop-blur sm:px-5">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setIsMobileSidebarOpen(true)}
                className="grid h-9 w-9 place-items-center rounded-md text-fg-3 hover:bg-surface-2 hover:text-fg md:hidden"
                aria-label="Open navigation menu"
              >
                <Menu size={18} />
              </button>
              <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[13px]">
                <Link to="/app" className="hidden shrink-0 rounded px-1 text-fg-3 hover:text-fg lg:inline">
                  Repositories
                </Link>
                <span className="hidden text-fg-4 lg:inline">/</span>
                <RepositorySwitcher />
                <span className="hidden text-fg-4 sm:inline">/</span>
                <span className="hidden truncate font-medium text-fg sm:inline">{pageTitle}</span>
              </nav>
              {activeRepository && (
                <span className={`ml-1 hidden shrink-0 items-center gap-1.5 rounded-full border border-line px-2 py-0.5 text-[12px] md:inline-flex ${statusBadge.cls}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${statusBadge.dot}`} />
                  {statusBadge.text}
                </span>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setIsCommandPaletteOpen(true)}
                className="flex h-9 items-center gap-2 rounded-md border border-line bg-surface px-2.5 text-[13px] text-fg-3 transition-colors hover:border-line-strong hover:text-fg-2 lg:w-[260px]"
                aria-label="Search or run a command"
              >
                <Search size={15} />
                <span className="hidden lg:inline">Search or jump to…</span>
                <kbd className="ml-auto hidden rounded border border-line bg-surface-2 px-1.5 text-[11px] text-fg-3 lg:inline">Ctrl K</kbd>
              </button>
              <button
                type="button"
                onClick={() => setRepoModalOpen(true)}
                disabled={isScanning}
                title="Switch or open a repository"
                className="hidden h-9 items-center gap-1.5 rounded-md border border-line px-3 text-[13px] text-fg-2 transition-colors hover:border-line-strong hover:text-fg disabled:opacity-50 sm:flex"
              >
                <FolderOpen size={15} />
                <span className="hidden xl:inline">Switch Repo</span>
              </button>
              {activeRepository && (
                <button
                  type="button"
                  onClick={() => scanRepo(activeRepository)}
                  disabled={isScanning}
                  title="Rescan repository"
                  className="flex h-9 items-center gap-1.5 rounded-md bg-fg px-3 text-[13px] font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  <RefreshCw size={15} className={isScanning ? 'animate-spin' : ''} />
                  <span className="hidden sm:inline">{isScanning ? 'Scanning…' : 'Rescan'}</span>
                </button>
              )}
            </div>
            {isScanning && <div className="scan-beam absolute inset-x-0 -bottom-px h-[2px]" aria-hidden="true" />}
          </header>

          {/* Dynamic Page Outlet */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
            <ErrorBoundary resetKey={location.pathname}>
              <Suspense fallback={<PageFallback />}>
                <motion.div
                  key={location.pathname}
                  className="flex-1 flex flex-col overflow-hidden"
                  initial={shouldReduceMotion ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: shouldReduceMotion ? 0 : 0.15 }}
                >
                  <Outlet />
                </motion.div>
              </Suspense>
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
