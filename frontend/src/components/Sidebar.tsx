import React from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import {
  Compass,
  FolderTree,
  Search,
  MessageSquare,
  Share2,
  Tv,
  Activity,
  FileText,
  Settings,
  Folder,
  FolderOpen,
  RefreshCw,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useWorkspaceStore } from '../stores/workspaceStore';
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from './ui/Tooltip';

interface NavItem {
  name: string;
  path: string;
  icon: LucideIcon;
  badge?: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: '01 — WORKSPACE',
    items: [
      { name: 'Overview', path: '/overview', icon: Compass },
      { name: 'Explorer', path: '/explorer', icon: FolderTree },
      { name: 'Search', path: '/search', icon: Search },
      { name: 'Assistant', path: '/chat', icon: MessageSquare },
    ],
  },
  {
    title: '02 — ANALYSIS',
    items: [
      { name: 'Dependencies', path: '/graph', icon: Share2 },
      { name: 'Architecture', path: '/architecture', icon: Tv },
      { name: 'Code Health', path: '/health-dashboard', icon: Activity },
    ],
  },
  {
    title: '03 — OUTPUT',
    items: [
      { name: 'Documentation', path: '/documentation', icon: FileText },
    ],
  },
  {
    title: '04 — SYSTEM',
    items: [
      { name: 'Settings', path: '/settings', icon: Settings },
    ],
  },
];

function getRepoBasename(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  return segments[segments.length - 1] || path;
}

interface SidebarProps {
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isMobileOpen, onCloseMobile }) => {
  const location = useLocation();
  const activeRepository = useWorkspaceStore((s) => s.activeRepository);
  const scanStatus = useWorkspaceStore((s) => s.scanStatus);
  const scanRepo = useWorkspaceStore((s) => s.scanRepo);
  const setSelectedFile = useWorkspaceStore((s) => s.setSelectedFile);
  const setRepoModalOpen = useWorkspaceStore((s) => s.setRepoModalOpen);

  const repoMatch = location.pathname.match(/^\/app\/repositories\/([^/]+)/);
  const repoPrefix = repoMatch ? `/app/repositories/${repoMatch[1]}` : '';

  const repoName = activeRepository ? getRepoBasename(activeRepository) : null;
  const isScanning = scanStatus === 'scanning';

  const handleRescan = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (activeRepository && !isScanning) {
      scanRepo(activeRepository);
    }
  };

  const handleItemClick = (path: string) => {
    if (path === '/' || path === '/overview') {
      setSelectedFile(null);
    }
    if (onCloseMobile) {
      onCloseMobile();
    }
  };

  const getStatusBadge = () => {
    switch (scanStatus) {
      case 'indexed':
        return { text: 'Indexed', color: '#7FB77E' };
      case 'scanning':
        return { text: 'Scanning...', color: '#F2A93B' };
      case 'error':
        return { text: 'Scan error', color: '#E5654B' };
      default:
        return { text: 'Ready', color: '#8A928B' };
    }
  };

  const statusBadge = getStatusBadge();

  return (
    <TooltipProvider delayDuration={200}>
      {/* Mobile Backdrop Overlay */}
      {isMobileOpen && (
        <div
          onClick={onCloseMobile}
          className="md:hidden fixed inset-0 bg-[#0D0F0E]/80 z-40"
        />
      )}

      {/* Main Sidebar Container */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 flex flex-col w-[240px] min-w-[240px] h-full bg-[#151816] border-r border-[#262B28] select-none shrink-0 transition-transform duration-200 ease-in-out md:translate-x-0 ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* ── 1. Top Application Branding ── */}
        <div className="flex items-center justify-between h-[44px] px-4 border-b border-[#262B28] bg-[#151816]">
          <Link
            to="/app"
            className="flex items-center gap-2.5 text-decoration-none group cursor-pointer"
          >
            <div className="flex h-5 w-5 items-center justify-center rounded-[3px] bg-[#F2A93B] text-[11px] font-bold text-[#0D0F0E] font-mono">
              R
            </div>
            <div className="flex flex-col">
              <span className="font-sans text-[12px] font-semibold text-[#E9ECE6] tracking-tight leading-none group-hover:text-[#F2A93B] transition-colors">
                Repository Scanner
              </span>
            </div>
          </Link>

          {/* Mobile close button */}
          {onCloseMobile && (
            <button
              onClick={onCloseMobile}
              className="md:hidden p-1 rounded hover:bg-[#1C201D] text-[#8A928B]"
              aria-label="Close menu"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* ── 2. Active Repository Identity Card ── */}
        <div
          onClick={() => setRepoModalOpen(true)}
          className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-[#262B28] bg-[#1C201D] cursor-pointer hover:bg-[#262B28] transition-colors"
          title={activeRepository ? `${activeRepository} — Click to switch repository` : 'Click to open or switch repository'}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Folder size={14} className="text-[#F2A93B] shrink-0" />
            <div className="flex flex-col min-w-0">
              <span
                className="font-mono text-[11px] font-medium text-[#E9ECE6] truncate"
                title={activeRepository || 'No workspace opened'}
              >
                {repoName || 'No repository'}
              </span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: statusBadge.color }}
                />
                <span className="font-mono text-[10px] text-[#8A928B]">
                  {activeRepository ? statusBadge.text : 'Open codebase'}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Action buttons */}
          <div className="flex items-center gap-1 shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRepoModalOpen(true);
                  }}
                  className="p-1 rounded-[3px] text-[#8A928B] hover:text-[#E9ECE6] hover:bg-[#151816]"
                  aria-label="Switch repository"
                >
                  <FolderOpen size={13} className="text-[#F2A93B]" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Switch repository</TooltipContent>
            </Tooltip>

            {activeRepository && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={handleRescan}
                    disabled={isScanning}
                    className="p-1 rounded-[3px] text-[#8A928B] hover:text-[#E9ECE6] hover:bg-[#151816] disabled:opacity-40"
                    aria-label="Rescan repository"
                  >
                    <RefreshCw
                      size={13}
                      className={isScanning ? 'animate-spin text-[#F2A93B]' : ''}
                    />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">Rescan repository</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        {/* ── 3. Categorized Navigation Sections ── */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 flex flex-col gap-4">
          {NAV_SECTIONS.map((section) => (
            <div key={section.title} className="flex flex-col gap-0.5">
              {/* Section Header with Survey Map Mono Style */}
              <div className="px-2.5 py-1 font-mono text-[10px] font-semibold tracking-wider text-[#5E645F] uppercase">
                {section.title}
              </div>

              {/* Section Navigation Items */}
              {section.items.map((item) => {
                const Icon = item.icon;
                const targetPath = repoPrefix ? `${repoPrefix}${item.path}` : item.path;
                const isActive =
                  location.pathname === targetPath ||
                  (item.path === '/overview' && location.pathname === repoPrefix);

                return (
                  <NavLink
                    key={item.path}
                    to={targetPath}
                    onClick={() => handleItemClick(item.path)}
                    className={`flex items-center justify-between px-2.5 py-1.5 rounded-[4px] text-[12px] font-sans transition-colors ${
                      isActive
                        ? 'bg-[#1C201D] text-[#E9ECE6] font-medium border-l-2 border-[#F2A93B]'
                        : 'text-[#8A928B] hover:bg-[#1C201D] hover:text-[#E9ECE6] border-l-2 border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon
                        size={14}
                        className={`shrink-0 ${
                          isActive ? 'text-[#F2A93B]' : 'text-[#5E645F]'
                        }`}
                      />
                      <span>{item.name}</span>
                    </div>

                    {item.badge && (
                      <span className="font-mono text-[10px] text-[#8A928B] bg-[#262B28] px-1.5 py-0.5 rounded-[2px]">
                        {item.badge}
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        {/* ── 4. Bottom Footer Info ── */}
        <div className="flex items-center justify-between px-3.5 py-2.5 border-t border-[#262B28] bg-[#151816] font-mono text-[10px] text-[#5E645F]">
          <span>Antigravity v2.0</span>
          <span>Survey Map</span>
        </div>
      </aside>
    </TooltipProvider>
  );
};
