import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  FolderTree,
  Share2,
  Tv,
  MessageSquare,
  FileText,
  Activity,
  Settings,
  RefreshCw,
  FolderOpen,
  Compass,
  Trash2,
  Sparkles,
} from 'lucide-react';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { colors, radius, font } from '../design-system/tokens';

interface CommandItem {
  id: string;
  title: string;
  subtitle?: string;
  category: 'Navigation' | 'Actions';
  icon: React.ReactNode;
  shortcut?: string;
  run: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeRepository = useWorkspaceStore((s) => s.activeRepository);
  const scanRepo = useWorkspaceStore((s) => s.scanRepo);
  const selectLocalDirectory = useWorkspaceStore((s) => s.selectLocalDirectory);
  const setRepoModalOpen = useWorkspaceStore((s) => s.setRepoModalOpen);
  const clearChatHistory = useWorkspaceStore((s) => s.clearChatHistory);
  const setSelectedFile = useWorkspaceStore((s) => s.setSelectedFile);

  const commands: CommandItem[] = [
    // ── Navigation ──
    {
      id: 'nav-overview',
      title: 'Open Overview',
      subtitle: 'Workspace summary, language breakdown & telemetry',
      category: 'Navigation',
      icon: <Compass size={16} />,
      shortcut: 'G O',
      run: () => {
        setSelectedFile(null);
        navigate('/');
      },
    },
    {
      id: 'nav-explorer',
      title: 'Open File Explorer',
      subtitle: 'Browse source tree, files, and AST code entities',
      category: 'Navigation',
      icon: <FolderTree size={16} />,
      shortcut: 'G E',
      run: () => navigate('/explorer'),
    },
    {
      id: 'nav-search',
      title: 'Search Codebase',
      subtitle: 'Semantic vector search across symbols & docstrings',
      category: 'Navigation',
      icon: <Search size={16} />,
      shortcut: 'G S',
      run: () => navigate('/search'),
    },
    {
      id: 'nav-chat',
      title: 'Ask AI Assistant',
      subtitle: 'Repository-aware intelligence and explanation chat',
      category: 'Navigation',
      icon: <MessageSquare size={16} />,
      shortcut: 'G A',
      run: () => navigate('/chat'),
    },
    {
      id: 'nav-dependencies',
      title: 'Analyze Dependencies',
      subtitle: 'Visualize module relationships and call graph',
      category: 'Navigation',
      icon: <Share2 size={16} />,
      shortcut: 'G D',
      run: () => navigate('/graph'),
    },
    {
      id: 'nav-architecture',
      title: 'Analyze Architecture',
      subtitle: 'System layer decomposition and module topology',
      category: 'Navigation',
      icon: <Tv size={16} />,
      shortcut: 'G C',
      run: () => navigate('/architecture'),
    },
    {
      id: 'nav-health',
      title: 'View Code Health',
      subtitle: 'Risk factors, technical debt and complexity scores',
      category: 'Navigation',
      icon: <Activity size={16} />,
      shortcut: 'G H',
      run: () => navigate('/health-dashboard'),
    },
    {
      id: 'nav-docs',
      title: 'Generate Documentation',
      subtitle: 'Architecture summaries and module doc generators',
      category: 'Navigation',
      icon: <FileText size={16} />,
      shortcut: 'G M',
      run: () => navigate('/documentation'),
    },
    {
      id: 'nav-settings',
      title: 'Open Settings',
      subtitle: 'Provider status, model preferences, and telemetry',
      category: 'Navigation',
      icon: <Settings size={16} />,
      shortcut: 'G ,',
      run: () => navigate('/settings'),
    },

    // ── Actions ──
    {
      id: 'act-rescan',
      title: 'Rescan Current Repository',
      subtitle: activeRepository ? `Re-index: ${activeRepository}` : 'No active repository to scan',
      category: 'Actions',
      icon: <RefreshCw size={16} />,
      shortcut: 'R',
      run: () => {
        if (activeRepository) {
          scanRepo(activeRepository);
        } else {
          navigate('/');
        }
      },
    },
    {
      id: 'act-switch-repo',
      title: 'Switch or Open Repository...',
      subtitle: 'Open repository switcher (local PC folder or public GitHub URL)',
      category: 'Actions',
      icon: <FolderOpen size={16} />,
      shortcut: 'O',
      run: () => {
        setRepoModalOpen(true);
      },
    },
    {
      id: 'act-browse-local',
      title: 'Browse Local Folder from PC...',
      subtitle: 'Trigger native OS folder picker to choose local directory',
      category: 'Actions',
      icon: <FolderOpen size={16} />,
      shortcut: 'B',
      run: () => {
        selectLocalDirectory();
      },
    },
    {
      id: 'act-clear-chat',
      title: 'Clear AI Chat History',
      subtitle: 'Reset conversation messages for current workspace',
      category: 'Actions',
      icon: <Trash2 size={16} />,
      run: () => clearChatHistory(),
    },
  ];

  const filtered = commands.filter((cmd) => {
    const q = query.toLowerCase().trim();
    if (!q) return true;
    return (
      cmd.title.toLowerCase().includes(q) ||
      (cmd.subtitle && cmd.subtitle.toLowerCase().includes(q)) ||
      cmd.category.toLowerCase().includes(q)
    );
  });

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filtered.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filtered.length) % Math.max(1, filtered.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        filtered[selectedIndex].run();
        onClose();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '12vh',
        zIndex: 9999,
        backdropFilter: 'blur(2px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '560px',
          backgroundColor: colors.bg.surface,
          border: `1px solid ${colors.border.strong}`,
          borderRadius: radius.lg,
          boxShadow: '0 16px 40px rgba(0, 0, 0, 0.6)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '440px',
        }}
      >
        {/* Search Input Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '12px 16px',
            borderBottom: `1px solid ${colors.border.default}`,
            gap: '10px',
            backgroundColor: colors.bg.surfaceSecondary,
          }}
        >
          <Search size={16} style={{ color: colors.accent.blue, flexShrink: 0 }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or jump to feature..."
            style={{
              width: '100%',
              backgroundColor: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: font.size.base,
              color: colors.text.primary,
              fontFamily: font.sans,
            }}
          />
          <span
            style={{
              fontSize: '11px',
              fontFamily: font.mono,
              color: colors.text.muted,
              backgroundColor: colors.bg.elevated,
              padding: '2px 6px',
              borderRadius: radius.sm,
              flexShrink: 0,
            }}
          >
            ESC
          </span>
        </div>

        {/* Command List */}
        <div
          style={{
            overflowY: 'auto',
            padding: '8px 0',
            flex: 1,
          }}
        >
          {filtered.length === 0 ? (
            <div
              style={{
                padding: '32px 16px',
                textAlign: 'center',
                color: colors.text.muted,
                fontSize: font.size.sm,
              }}
            >
              No matching commands found.
            </div>
          ) : (
            filtered.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  onClick={() => {
                    item.run();
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 16px',
                    cursor: 'pointer',
                    backgroundColor: isSelected ? colors.bg.surfaceSecondary : 'transparent',
                    borderLeft: isSelected
                      ? `2px solid ${colors.accent.blue}`
                      : '2px solid transparent',
                    transition: 'background-color 0.08s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                    <span
                      style={{
                        color: isSelected ? colors.accent.blue : colors.text.muted,
                        display: 'flex',
                        alignItems: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {item.icon}
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <span
                        style={{
                          fontSize: font.size.md,
                          fontWeight: font.weight.medium,
                          color: isSelected ? colors.text.primary : colors.text.secondary,
                          fontFamily: font.sans,
                        }}
                      >
                        {item.title}
                      </span>
                      {item.subtitle && (
                        <span
                          style={{
                            fontSize: font.size.xs,
                            color: colors.text.muted,
                            fontFamily: font.sans,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {item.subtitle}
                        </span>
                      )}
                    </div>
                  </div>

                  {item.shortcut && (
                    <span
                      style={{
                        fontSize: '11px',
                        fontFamily: font.mono,
                        color: colors.text.muted,
                        backgroundColor: colors.bg.elevated,
                        padding: '2px 6px',
                        borderRadius: radius.sm,
                        flexShrink: 0,
                        marginLeft: '12px',
                      }}
                    >
                      {item.shortcut}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer shortcuts hint */}
        <div
          style={{
            padding: '8px 16px',
            borderTop: `1px solid ${colors.border.subtle}`,
            backgroundColor: colors.bg.primary,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '11px',
            color: colors.text.muted,
            fontFamily: font.mono,
          }}
        >
          <div style={{ display: 'flex', gap: '12px' }}>
            <span>↑↓ navigate</span>
            <span>↵ select</span>
            <span>esc close</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Sparkles size={11} style={{ color: colors.accent.blue }} />
            <span>Antigravity Engine</span>
          </div>
        </div>
      </div>
    </div>
  );
};
