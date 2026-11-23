import React from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import {
  Compass,
  FolderTree,
  Search,
  MessageSquare,
  Share2,
  Layers,
  Activity,
  FileText,
  Settings,
  RefreshCw,
  X,
  GitBranch,
  ShieldCheck,
  Boxes,
  ChevronsUpDown,
  type LucideIcon,
} from 'lucide-react';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from './ui/Tooltip';
import { LogoMark } from './brand/Logo';

interface NavItem {
  name: string;
  path: string;
  icon: LucideIcon;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Workspace',
    items: [
      { name: 'Overview', path: '/overview', icon: Compass },
      { name: 'Explorer', path: '/explorer', icon: FolderTree },
      { name: 'Search', path: '/search', icon: Search },
      { name: 'Assistant', path: '/chat', icon: MessageSquare },
    ],
  },
  {
    title: 'Analysis',
    items: [
      { name: 'Dependencies', path: '/graph', icon: Share2 },
      { name: 'Architecture', path: '/architecture', icon: Layers },
      { name: 'System Design', path: '/system-design', icon: Boxes },
      { name: 'Code Health', path: '/health-dashboard', icon: Activity },
      { name: 'Change Impact', path: '/impact', icon: GitBranch },
      { name: 'Code Review', path: '/review', icon: ShieldCheck },
    ],
  },
  {
    title: 'Output',
    items: [{ name: 'Documentation', path: '/documentation', icon: FileText }],
  },
  {
    title: 'System',
    items: [{ name: 'Settings', path: '/settings', icon: Settings }],
  },
];

function getRepoBasename(path: string): string {
  const segments = path.replace(/\\/g, '/').split('/').filter(Boolean);
  return segments[segments.length - 1] || path;
}

const STATUS: Record<string, { text: string; dot: string }> = {
  indexed: { text: 'Indexed', dot: 'bg-mint' },
  scanning: { text: 'Scanning…', dot: 'bg-ion live-dot' },
  error: { text: 'Scan failed', dot: 'bg-rose' },
  idle: { text: 'Not scanned yet', dot: 'bg-fg-4' },
};

interface SidebarProps {
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isMobileOpen, onCloseMobile }) => {
  const location = useLocation();
  const activeRepository = useWorkspaceStore((s) => s.activeRepository);
  const repositoryInfo = useWorkspaceStore((s) => s.repositoryInfo);
  const scanStatus = useWorkspaceStore((s) => s.scanStatus);
  const scanRepo = useWorkspaceStore((s) => s.scanRepo);
  const setSelectedFile = useWorkspaceStore((s) => s.setSelectedFile);
  const setRepoModalOpen = useWorkspaceStore((s) => s.setRepoModalOpen);
  const activeRepositoryId = useWorkspaceStore((s) => s.activeRepositoryId);

  const repoMatch = location.pathname.match(/^\/app\/repositories\/([^/]+)/);
  const currentRepoId = repoMatch ? repoMatch[1] : activeRepositoryId;
  const repoPrefix = currentRepoId ? `/app/repositories/${currentRepoId}` : '';
  const repoName = repositoryInfo?.name || (activeRepository ? getRepoBasename(activeRepository) : null);
  const displayPath = (repositoryInfo?.source_type === 'github' && repositoryInfo?.source_path)
    ? repositoryInfo.source_path
    : (activeRepository || '');
  const isScanning = scanStatus === 'scanning';
  const status = STATUS[scanStatus] ?? STATUS.idle;

  const handleItemClick = (path: string) => {
    if (path === '/overview') setSelectedFile(null);
    onCloseMobile?.();
  };

  return (
    <TooltipProvider delayDuration={250}>
      {isMobileOpen && (
        <div
          onClick={onCloseMobile}
          className="md:hidden fixed inset-0 z-40 bg-black/70 backdrop-blur-[2px]"
          aria-hidden="true"
        />
      )}

      <aside
        aria-label="Main navigation"
        className={`fixed md:static inset-y-0 left-0 z-50 flex h-full w-[248px] shrink-0 flex-col border-r border-line bg-ink select-none transition-transform duration-200 ease-out md:translate-x-0 ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-[52px] items-center justify-between px-4">
          <Link to="/app" className="flex items-center gap-2.5 rounded-md" onClick={onCloseMobile}>
            <LogoMark size={24} />
            <span className="text-[14px] font-semibold tracking-[-0.01em] text-fg">Repository Scanner</span>
          </Link>
          {onCloseMobile && (
            <button
              type="button"
              onClick={onCloseMobile}
              className="md:hidden grid h-8 w-8 place-items-center rounded-md text-fg-3 hover:bg-surface-2 hover:text-fg"
              aria-label="Close menu"
            >
              <X size={16} />
            </button>
          )}
        </div>

        <div className="px-3 pb-3">
          <div className="group flex items-center gap-2 rounded-[10px] border border-line bg-surface p-2.5 transition-colors hover:border-line-strong">
            <button
              type="button"
              onClick={() => setRepoModalOpen(true)}
              className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
              title={activeRepository ? `${repoName} (${displayPath}): switch repository` : 'Open a repository'}
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-surface-2 text-[13px] font-semibold text-fg">
                {(repoName || '?').slice(0, 1).toUpperCase()}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[13px] font-semibold text-fg">{repoName || 'No repository'}</span>
                <span className="flex items-center gap-1.5 text-[12px] text-fg-3">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${activeRepository ? status.dot : 'bg-fg-4'}`} />
                  {activeRepository ? status.text : 'Choose one to start'}
                </span>
              </span>
              <ChevronsUpDown size={14} className="ml-auto shrink-0 text-fg-4 group-hover:text-fg-3" />
            </button>
            {activeRepository && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => !isScanning && scanRepo(activeRepository)}
                    disabled={isScanning}
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-fg-3 hover:bg-surface-2 hover:text-fg disabled:opacity-50"
                    aria-label="Rescan repository"
                  >
                    <RefreshCw size={14} className={isScanning ? 'animate-spin text-ion' : ''} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">Rescan repository</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 pb-4 pt-1">
          {NAV_SECTIONS.map((section) => (
            <div key={section.title} className="flex flex-col gap-px">
              <div className="px-2.5 pb-1.5 text-[12px] font-medium text-fg-4">{section.title}</div>
              {section.items.map((item) => {
                const Icon = item.icon;
                const targetPath = repoPrefix ? `${repoPrefix}${item.path}` : item.path;
                const isActive = location.pathname === targetPath;
                return (
                  <NavLink
                    key={item.path}
                    to={targetPath}
                    onClick={() => handleItemClick(item.path)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`relative flex h-[34px] items-center gap-2.5 rounded-md px-2.5 text-[13.5px] transition-colors ${
                      isActive ? 'bg-surface-2 font-medium text-fg' : 'text-fg-3 hover:bg-surface hover:text-fg'
                    }`}
                  >
                    {isActive && (
                      <span className="absolute -left-3 top-2 bottom-2 w-[2px] rounded-full bg-ion shadow-[0_0_10px_rgba(53,215,255,0.7)]" />
                    )}
                    <Icon size={16} strokeWidth={1.75} className={isActive ? 'text-ion' : 'text-fg-4'} />
                    <span>{item.name}</span>
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="border-t border-line px-4 py-3 text-[12px] text-fg-4">
          Press <kbd className="rounded border border-line bg-surface px-1.5 py-px font-sans text-[11px] text-fg-3">Ctrl K</kbd> to jump anywhere
        </div>
      </aside>
    </TooltipProvider>
  );
};
