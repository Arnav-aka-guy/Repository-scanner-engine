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
      icon: <Compass size={15} />,
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
      icon: <FolderTree size={15} />,
      shortcut: 'G E',
      run: () => navigate('/explorer'),
    },
    {
      id: 'nav-search',
      title: 'Search Codebase',
      subtitle: 'Semantic vector search across symbols & docstrings',
      category: 'Navigation',
      icon: <Search size={15} />,
      shortcut: 'G S',
      run: () => navigate('/search'),
    },
    {
      id: 'nav-chat',
      title: 'Ask AI Assistant',
      subtitle: 'Repository-aware intelligence and explanation chat',
      category: 'Navigation',
      icon: <MessageSquare size={15} />,
      shortcut: 'G A',
      run: () => navigate('/chat'),
    },
    {
      id: 'nav-dependencies',
      title: 'Analyze Dependencies',
      subtitle: 'Visualize module relationships and call graph',
      category: 'Navigation',
      icon: <Share2 size={15} />,
      shortcut: 'G D',
      run: () => navigate('/graph'),
    },
    {
      id: 'nav-architecture',
      title: 'Analyze Architecture',
      subtitle: 'System layer decomposition and module topology',
      category: 'Navigation',
      icon: <Tv size={15} />,
      shortcut: 'G C',
      run: () => navigate('/architecture'),
    },
    {
      id: 'nav-health',
      title: 'View Code Health',
      subtitle: 'Risk factors, technical debt and complexity scores',
      category: 'Navigation',
      icon: <Activity size={15} />,
      shortcut: 'G H',
      run: () => navigate('/health-dashboard'),
    },
    {
      id: 'nav-docs',
      title: 'Generate Documentation',
      subtitle: 'Architecture summaries and module doc generators',
      category: 'Navigation',
      icon: <FileText size={15} />,
      shortcut: 'G M',
      run: () => navigate('/documentation'),
    },
    {
      id: 'nav-settings',
      title: 'Open Settings',
      subtitle: 'Provider status, model preferences, and telemetry',
      category: 'Navigation',
      icon: <Settings size={15} />,
      shortcut: 'G ,',
      run: () => navigate('/settings'),
    },

    // ── Actions ──
    {
      id: 'act-rescan',
      title: 'Rescan Current Repository',
      subtitle: activeRepository ? `Re-index: ${activeRepository}` : 'No active repository to scan',
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
      <DialogContent className="max-w-[560px] p-0 overflow-hidden top-[25%] translate-y-[-25%]">
        {/* Search Input Bar */}
        <div className="flex items-center gap-2.5 border-b border-[#262B28] bg-[#1C201D] px-4 py-3">
          <Search size={15} className="text-[#F2A93B] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or jump to feature..."
            className="w-full bg-transparent text-[13px] text-[#E9ECE6] outline-none font-sans placeholder:text-[#5E645F]"
          />
          <kbd className="rounded-[3px] border border-[#262B28] bg-[#262B28] px-1.5 py-0.5 font-mono text-[10px] text-[#8A928B]">
            ESC
          </kbd>
        </div>

        {/* Command List */}
        <div className="max-h-[320px] overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-[12px] font-mono text-[#8A928B]">
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
                  className={`flex items-center justify-between px-4 py-2 text-[12px] cursor-pointer transition-colors ${
                    isSelected
                      ? 'border-l-2 border-[#F2A93B] bg-[#1C201D]'
                      : 'border-l-2 border-transparent hover:bg-[#1C201D]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={isSelected ? 'text-[#F2A93B]' : 'text-[#8A928B]'}>
                      {item.icon}
                    </span>
                    <div className="flex flex-col min-w-0">
                      <span className={`font-medium truncate ${isSelected ? 'text-[#E9ECE6]' : 'text-[#8A928B]'}`}>
                        {item.title}
                      </span>
                      {item.subtitle && (
                        <span className="font-mono text-[10px] text-[#5E645F] truncate">
                          {item.subtitle}
                        </span>
                      )}
                    </div>
                  </div>

                  {item.shortcut && (
                    <kbd className="shrink-0 ml-3 rounded-[2px] border border-[#262B28] bg-[#262B28] px-1.5 py-0.5 font-mono text-[10px] text-[#8A928B]">
                      {item.shortcut}
                    </kbd>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer shortcuts hint */}
        <div className="flex items-center justify-between border-t border-[#262B28] bg-[#0D0F0E] px-4 py-2 font-mono text-[10px] text-[#5E645F]">
          <div className="flex gap-3">
            <span>↑↓ navigate</span>
            <span>↵ select</span>
            <span>esc close</span>
          </div>
          <div className="flex items-center gap-1 text-[#8A928B]">
            <Sparkles size={10} className="text-[#F2A93B]" />
            <span>Antigravity Engine</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
