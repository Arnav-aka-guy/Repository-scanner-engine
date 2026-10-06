import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
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
  RefreshCw,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { colors, radius, font } from '../design-system/tokens';

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
    title: 'WORKSPACE',
    items: [
      { name: 'Overview', path: '/', icon: Compass },
      { name: 'Explorer', path: '/explorer', icon: FolderTree },
      { name: 'Search', path: '/search', icon: Search },
      { name: 'Assistant', path: '/chat', icon: MessageSquare },
    ],
  },
  {
    title: 'ANALYSIS',
    items: [
      { name: 'Dependencies', path: '/graph', icon: Share2 },
      { name: 'Architecture', path: '/architecture', icon: Tv },
      { name: 'Code Health', path: '/health-dashboard', icon: Activity },
    ],
  },
  {
    title: 'OUTPUT',
    items: [
      { name: 'Documentation', path: '/documentation', icon: FileText },
    ],
  },
  {
    title: 'SYSTEM',
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

  const repoName = activeRepository ? getRepoBasename(activeRepository) : null;
  const isScanning = scanStatus === 'scanning';

  const handleRescan = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (activeRepository && !isScanning) {
      scanRepo(activeRepository);
    }
  };

  const handleItemClick = (path: string) => {
    if (path === '/') {
      setSelectedFile(null);
    }
    if (onCloseMobile) {
      onCloseMobile();
    }
  };

  const getStatusBadge = () => {
    switch (scanStatus) {
      case 'indexed':
        return { text: 'Indexed', color: colors.status.success };
      case 'scanning':
        return { text: 'Scanning...', color: colors.accent.blue };
      case 'error':
        return { text: 'Scan error', color: colors.status.danger };
      default:
        return { text: 'Ready', color: colors.text.muted };
    }
  };

  const statusBadge = getStatusBadge();

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isMobileOpen && (
        <div
          onClick={onCloseMobile}
          className="md:hidden fixed inset-0 bg-black/60 z-40"
        />
      )}

      {/* Main Sidebar Container */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 flex flex-col transition-transform duration-200 ease-in-out md:translate-x-0 ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{
          width: '240px',
          minWidth: '240px',
          height: '100%',
          backgroundColor: colors.bg.surface,
          borderRight: `1px solid ${colors.border.default}`,
          userSelect: 'none',
          flexShrink: 0,
        }}
      >
        {/* ── 1. Top Application Branding ── */}
        <div
          style={{
            padding: '14px 16px',
            borderBottom: `1px solid ${colors.border.default}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: '48px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '22px',
                height: '22px',
                borderRadius: radius.sm,
                backgroundColor: colors.accent.blue,
                color: '#fff',
                fontSize: '12px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: font.sans,
              }}
            >
              R
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: colors.text.primary,
                  fontFamily: font.sans,
                  lineHeight: '1.2',
                }}
              >
                Repository Scanner
              </span>
            </div>
          </div>

          {/* Mobile close button */}
          {onCloseMobile && (
            <button
              onClick={onCloseMobile}
              className="md:hidden p-1 rounded hover:bg-[#1B2028]"
              style={{ color: colors.text.muted }}
              aria-label="Close menu"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* ── 2. Active Repository Identity Card ── */}
        <div
          style={{
            padding: '12px 14px',
            borderBottom: `1px solid ${colors.border.subtle}`,
            backgroundColor: colors.bg.surfaceSecondary,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
              <Folder size={14} style={{ color: colors.accent.blue, flexShrink: 0 }} />
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: colors.text.primary,
                    fontFamily: font.mono,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={activeRepository || 'No workspace opened'}
                >
                  {repoName || 'No repository'}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '2px' }}>
                  <span
                    style={{
                      width: '5px',
                      height: '5px',
                      borderRadius: '50%',
                      backgroundColor: statusBadge.color,
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontSize: '10px',
                      color: colors.text.muted,
                      fontFamily: font.sans,
                    }}
                  >
                    {activeRepository ? statusBadge.text : 'Select folder to begin'}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Rescan icon button */}
            {activeRepository && (
              <button
                onClick={handleRescan}
                disabled={isScanning}
                title="Rescan repository"
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: '4px',
                  borderRadius: radius.sm,
                  cursor: isScanning ? 'not-allowed' : 'pointer',
                  color: isScanning ? colors.accent.blue : colors.text.muted,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <RefreshCw
                  size={12}
                  style={{
                    animation: isScanning ? 'ds-spin 1s linear infinite' : 'none',
                  }}
                />
              </button>
            )}
          </div>
        </div>

        {/* ── 3. Categorized Navigation Sections ── */}
        <nav
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '12px 10px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          {NAV_SECTIONS.map((section) => (
            <div key={section.title} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {/* Section Header */}
              <div
                style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  letterSpacing: '0.08em',
                  color: colors.text.muted,
                  padding: '4px 10px',
                  textTransform: 'uppercase',
                  fontFamily: font.sans,
                }}
              >
                {section.title}
              </div>

              {/* Section Navigation Items */}
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;

                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={() => handleItemClick(item.path)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 10px',
                      borderRadius: radius.md,
                      textDecoration: 'none',
                      fontSize: '13px',
                      fontFamily: font.sans,
                      fontWeight: isActive ? 500 : 400,
                      color: isActive ? colors.text.primary : colors.text.secondary,
                      backgroundColor: isActive ? colors.bg.surfaceSecondary : 'transparent',
                      borderLeft: isActive
                        ? `2px solid ${colors.accent.blue}`
                        : '2px solid transparent',
                      transition: `background-color ${colors.border.subtle} 0.1s ease`,
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.backgroundColor = colors.bg.surfaceSecondary;
                        e.currentTarget.style.color = colors.text.primary;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.backgroundColor = 'transparent';
                        e.currentTarget.style.color = colors.text.secondary;
                      }
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Icon
                        size={15}
                        style={{
                          color: isActive ? colors.accent.blue : colors.text.muted,
                          flexShrink: 0,
                        }}
                      />
                      <span>{item.name}</span>
                    </div>

                    {item.badge && (
                      <span
                        style={{
                          fontSize: '10px',
                          color: colors.text.muted,
                          backgroundColor: colors.bg.elevated,
                          padding: '1px 5px',
                          borderRadius: radius.sm,
                          fontFamily: font.mono,
                        }}
                      >
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
        <div
          style={{
            padding: '10px 14px',
            borderTop: `1px solid ${colors.border.subtle}`,
            fontSize: '11px',
            color: colors.text.muted,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontFamily: font.mono,
          }}
        >
          <span>Antigravity v2.0</span>
          <span>HUD Dark</span>
        </div>
      </aside>
    </>
  );
};
