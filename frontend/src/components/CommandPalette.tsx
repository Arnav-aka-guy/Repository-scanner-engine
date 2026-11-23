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
  Boxes,
} from 'lucide-react';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useRepoNavigate } from '../hooks/useRepoNavigate';
import { Dialog, DialogContent } from './ui/Dialog';

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
  const { navigateRepo } = useRepoNavigate();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeRepository = useWorkspaceStore((s) => s.activeRepository);
  const repositoryInfo = useWorkspaceStore((s) => s.repositoryInfo);
  const scanRepo = useWorkspaceStore((s) => s.scanRepo);
  const selectLocalDirectory = useWorkspaceStore((s) => s.selectLocalDirectory);
  const setRepoModalOpen = useWorkspaceStore((s) => s.setRepoModalOpen);
  const clearChatHistory = useWorkspaceStore((s) => s.clearChatHistory);
  const setSelectedFile = useWorkspaceStore((s) => s.setSelectedFile);

  const repoDisplayName = repositoryInfo?.name || (activeRepository ? activeRepository.replace(/\\/g, '/').split('/').filter(Boolean).pop() : null);

  const commands: CommandItem[] = [
    // Navigation
    {
      id: 'nav-overview',
      title: 'Open Overview',
      subtitle: 'Workspace summary, language breakdown & telemetry',
      category: 'Navigation',
      icon: <Compass size={15} />,
      shortcut: 'G O',
      run: () => {
        setSelectedFile(null);
        navigateRepo('overview');
      },
    },
    {
      id: 'nav-explorer',
      title: 'Open File Explorer',
      subtitle: 'Browse source tree, files, and AST code entities',
      category: 'Navigation',
      icon: <FolderTree size={15} />,
      shortcut: 'G E',
      run: () => navigateRepo('explorer'),
    },
    {
      id: 'nav-search',
      title: 'Search Codebase',
      subtitle: 'Semantic vector search across symbols & docstrings',
      category: 'Navigation',
      icon: <Search size={15} />,
      shortcut: 'G S',
      run: () => navigateRepo('search'),
    },
    {
      id: 'nav-chat',
      title: 'Ask AI Assistant',
      subtitle: 'Repository-aware intelligence and explanation chat',
      category: 'Navigation',
      icon: <MessageSquare size={15} />,
      shortcut: 'G A',
      run: () => navigateRepo('chat'),
    },
    {
      id: 'nav-dependencies',
      title: 'Analyze Dependencies',
      subtitle: 'Visualize module relationships and call graph',
      category: 'Navigation',
      icon: <Share2 size={15} />,
      shortcut: 'G D',
      run: () => navigateRepo('graph'),
    },
    {
      id: 'nav-architecture',
      title: 'Analyze Architecture',
      subtitle: 'System layer decomposition and module topology',
      category: 'Navigation',
      icon: <Tv size={15} />,
      shortcut: 'G C',
      run: () => navigateRepo('architecture'),
    },
    {
      id: 'nav-system-design',
      title: 'Draw System Design',
      subtitle: 'Layered system design diagram (Groq AI)',
      category: 'Navigation',
      icon: <Boxes size={15} />,
      run: () => navigateRepo('system-design'),
    },
    {
      id: 'nav-health',
      title: 'View Code Health',
      subtitle: 'Risk factors, technical debt and complexity scores',
      category: 'Navigation',
      icon: <Activity size={15} />,
      shortcut: 'G H',
      run: () => navigateRepo('health-dashboard'),
    },
    {
      id: 'nav-docs',
      title: 'Generate Documentation',
      subtitle: 'Architecture summaries and module doc generators',
      category: 'Navigation',
      icon: <FileText size={15} />,
      shortcut: 'G M',
      run: () => navigateRepo('documentation'),
    },
    {
      id: 'nav-settings',
      title: 'Open Settings',
      subtitle: 'Provider status, model preferences, and telemetry',
      category: 'Navigation',
      icon: <Settings size={15} />,
      shortcut: 'G ,',
      run: () => navigateRepo('settings'),
    },

    // Actions
    {
      id: 'act-rescan',
      title: 'Rescan Current Repository',
      subtitle: activeRepository ? `Re-index: ${repoDisplayName || activeRepository}` : 'No active repository to scan',
      category: 'Actions',
      icon: <RefreshCw size={15} />,
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
      icon: <FolderOpen size={15} />,
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
      icon: <FolderOpen size={15} />,
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
      icon: <Trash2 size={15} />,
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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="!top-[10%] !max-w-[600px] !translate-y-0 overflow-hidden !p-0 sm:!top-[16%]">
        <div className="flex items-center gap-3 border-b border-line py-3.5 pl-4 pr-12">
          <Search size={17} className="shrink-0 text-fg-3" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Jump to a page or run an action"
            aria-label="Search commands"
            className="w-full bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-4"
          />
        </div>

        <div className="max-h-[min(380px,60vh)] overflow-y-auto p-1.5" role="listbox">
          {filtered.length === 0 ? (
            <div className="px-4 py-10 text-center text-[13px] text-fg-3">No command matches "{query}".</div>
          ) : (
            filtered.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              const showCategory = idx === 0 || filtered[idx - 1].category !== item.category;
              return (
                <React.Fragment key={item.id}>
                  {showCategory && <div className="px-3 pb-1 pt-2.5 text-[12px] font-medium text-fg-4">{item.category}</div>}
                  <div
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      item.run();
                      onClose();
                    }}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2.5 transition-colors ${
                      isSelected ? 'bg-surface-2' : ''
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-md border ${isSelected ? 'border-ion/40 text-ion' : 'border-line text-fg-3'}`}>
                        {item.icon}
                      </span>
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-[14px] font-medium text-fg">{item.title}</span>
                        {item.subtitle && <span className="truncate text-[12.5px] text-fg-3">{item.subtitle}</span>}
                      </div>
                    </div>
                    {item.shortcut && (
                      <kbd className="ml-3 hidden shrink-0 rounded border border-line bg-surface px-1.5 text-[11px] text-fg-3 sm:inline">{item.shortcut}</kbd>
                    )}
                  </div>
                </React.Fragment>
              );
            })
          )}
        </div>

        <div className="hidden items-center gap-4 border-t border-line px-4 py-2.5 text-[12px] text-fg-4 sm:flex">
          <span><kbd className="font-sans text-fg-3">↑ ↓</kbd> to move</span>
          <span><kbd className="font-sans text-fg-3">Enter</kbd> to run</span>
          <span><kbd className="font-sans text-fg-3">Esc</kbd> to close</span>
        </div>
      </DialogContent>
    </Dialog>
  );
};
