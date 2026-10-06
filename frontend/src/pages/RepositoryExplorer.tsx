import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { FileTree } from '../components/FileTree';
import { CodeBlock } from '../components/CodeBlock';
import {
  FolderTree,
  FileCode,
  Search,
  Code,
  Share2,
  MessageSquare,
  Hash,
  ExternalLink,
  ArrowRight,
  Layers,
  ChevronRight,
  Filter,
  Copy,
  Check,
  PanelRightClose,
  PanelRightOpen,
  PanelLeftClose,
  PanelLeftOpen,
  Loader2,
  FileText,
  Terminal,
} from 'lucide-react';
import { colors, radius, font } from '../design-system/tokens';
import { Badge, Tooltip, Button, FilePath } from '../design-system/primitives';

/**
 * Disambiguates duplicate filenames by including parent directory context.
 * e.g., if multiple files are named "route.ts", displays "api/news/route.ts".
 */
function getDisambiguatedPath(fullPath: string, rootPath: string, allFiles: { path: string }[]): string {
  const normalizedRoot = rootPath.replace(/\\/g, '/').replace(/\/+$/, '');
  const normalizedFile = fullPath.replace(/\\/g, '/');
  let relative = normalizedFile;
  if (normalizedFile.startsWith(normalizedRoot)) {
    relative = normalizedFile.slice(normalizedRoot.length).replace(/^\/+/, '');
  }

  const filename = relative.split('/').pop() || relative;
  // Check if multiple files share this filename
  const duplicates = allFiles.filter((f) => {
    const fName = f.path.replace(/\\/g, '/').split('/').pop();
    return fName === filename;
  });

  if (duplicates.length > 1) {
    // Show 2 segments or full relative path if duplicate
    const parts = relative.split('/');
    if (parts.length > 2) {
      return parts.slice(-2).join('/');
    }
    return relative;
  }

  return filename;
}

/** Extract relative path from absolute path given repository root */
function getRelativePath(fullPath: string, rootPath: string): string {
  const normalizedRoot = rootPath.replace(/\\/g, '/').replace(/\/+$/, '');
  const normalizedFile = fullPath.replace(/\\/g, '/');
  if (normalizedFile.startsWith(normalizedRoot)) {
    return normalizedFile.slice(normalizedRoot.length).replace(/^\/+/, '');
  }
  return fullPath.replace(/\\/g, '/');
}

/** Parses imports from source code directly as immediate fallback */
function extractImportsFromCode(code: string): string[] {
  const lines = code.split('\n');
  const imports: Set<string> = new Set();

  for (const line of lines) {
    const trimmed = line.trim();
    // Python: from x import y, import x
    const pyFrom = trimmed.match(/^from\s+([a-zA-Z0-9_.]+)\s+import/);
    if (pyFrom) imports.add(pyFrom[1]);
    const pyImp = trimmed.match(/^import\s+([a-zA-Z0-9_.]+)/);
    if (pyImp) imports.add(pyImp[1]);

    // JS/TS: import ... from 'x', require('x')
    const jsImp = trimmed.match(/from\s+['"]([^'"]+)['"]/);
    if (jsImp) imports.add(jsImp[1]);
    const req = trimmed.match(/require\(['"]([^'"]+)['"]\)/);
    if (req) imports.add(req[1]);
  }

  return Array.from(imports).slice(0, 15);
}

export const RepositoryExplorer: React.FC = () => {
  const navigate = useNavigate();

  const activeRepository = useWorkspaceStore((s) => s.activeRepository) || '';
  const fileTree = useWorkspaceStore((s) => s.fileTree);
  const files = useWorkspaceStore((s) => s.files);
  const selectedFilePath = useWorkspaceStore((s) => s.selectedFilePath);
  const selectedFileDetail = useWorkspaceStore((s) => s.selectedFileDetail);
  const fileLoading = useWorkspaceStore((s) => s.fileLoading);
  const setSelectedFile = useWorkspaceStore((s) => s.setSelectedFile);
  const graphData = useWorkspaceStore((s) => s.graphData);
  const fetchGraph = useWorkspaceStore((s) => s.fetchGraph);

  // Layout pan toggles
  const [showLeftPane, setShowLeftPane] = useState(true);
  const [showRightPane, setShowRightPane] = useState(true);
  const [rightTab, setRightTab] = useState<'symbols' | 'relationships'>('symbols');
  const [fileFilter, setFileFilter] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [targetLine, setTargetLine] = useState<number | null>(null);

  // Fetch dependency graph in background if not already loaded
  useEffect(() => {
    if (activeRepository && !graphData) {
      fetchGraph('dependency').catch(() => {});
    }
  }, [activeRepository, graphData, fetchGraph]);

  // Relative path calculation for currently selected file
  const relativeFilePath = useMemo(() => {
    if (!selectedFilePath) return '';
    return getRelativePath(selectedFilePath, activeRepository);
  }, [selectedFilePath, activeRepository]);

  // Disambiguated filename calculation
  const disambiguatedFilename = useMemo(() => {
    if (!selectedFilePath) return '';
    return getDisambiguatedPath(selectedFilePath, activeRepository, files);
  }, [selectedFilePath, activeRepository, files]);

  // Filtered files when user types in file search filter
  const filteredFiles = useMemo(() => {
    if (!fileFilter.trim()) return null;
    const q = fileFilter.toLowerCase();
    return files.filter((f) => {
      const rel = getRelativePath(f.path, activeRepository).toLowerCase();
      return rel.includes(q) || f.name.toLowerCase().includes(q);
    });
  }, [files, fileFilter, activeRepository]);

  // Extracted entities grouped by type
  const entitiesByType = useMemo(() => {
    const raw = selectedFileDetail?.entities || [];
    const functions: any[] = [];
    const classes: any[] = [];
    const methods: any[] = [];
    const other: any[] = [];

    for (const ent of raw) {
      if (ent.entity_type === 'class') classes.push(ent);
      else if (ent.entity_type === 'function') functions.push(ent);
      else if (ent.entity_type === 'method') methods.push(ent);
      else other.push(ent);
    }

    return { functions, classes, methods, other, total: raw.length };
  }, [selectedFileDetail]);

  // Relationship calculations ("Used by" and "Depends on")
  const relationships = useMemo(() => {
    if (!selectedFilePath) {
      return { incoming: [], outgoing: [], codeImports: [] };
    }

    const normSelected = selectedFilePath.replace(/\\/g, '/').toLowerCase();
    const basenameSelected = normSelected.split('/').pop() || '';

    const incoming: string[] = [];
    const outgoing: string[] = [];

    // Parse graphData edges if available
    if (graphData && graphData.edges) {
      for (const edge of graphData.edges) {
        const edgeData = edge.data || edge;
        const src = (edgeData.source || '').replace(/\\/g, '/');
        const tgt = (edgeData.target || '').replace(/\\/g, '/');

        if (tgt.toLowerCase().includes(basenameSelected) && src !== tgt) {
          incoming.push(src);
        }
        if (src.toLowerCase().includes(basenameSelected) && src !== tgt) {
          outgoing.push(tgt);
        }
      }
    }

    // Extract imports directly from file content
    const codeImports = selectedFileDetail?.content
      ? extractImportsFromCode(selectedFileDetail.content)
      : [];

    return {
      incoming: Array.from(new Set(incoming)),
      outgoing: Array.from(new Set(outgoing)),
      codeImports,
    };
  }, [selectedFilePath, selectedFileDetail, graphData]);

  // Copy code helper
  const handleCopyCode = async () => {
    if (selectedFileDetail?.content) {
      await navigator.clipboard.writeText(selectedFileDetail.content);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  // Jump to symbol line in code viewer
  const handleJumpToLine = (startLine: number) => {
    setTargetLine(startLine);
    // Smooth reset target highlight after 2.5s
    setTimeout(() => setTargetLine(null), 2500);
  };

  // Ask AI about this file / symbol
  const handleAskAI = (context: string) => {
    navigate('/chat');
    // Pre-seed question in chat
    setTimeout(() => {
      const store = useWorkspaceStore.getState();
      store.sendChatMessage(`Explain ${context} in ${relativeFilePath}`);
    }, 100);
  };

  // Search references to this symbol
  const handleSearchReferences = (symbolName: string) => {
    navigate('/search');
    setTimeout(() => {
      useWorkspaceStore.getState().searchCode(symbolName);
    }, 100);
  };

  // Empty state when no repository is open
  if (!activeRepository) {
    return (
      <div
        className="flex-1 flex flex-col items-center justify-center p-8 select-none"
        style={{ backgroundColor: colors.bg.primary }}
      >
        <div
          style={{
            maxWidth: '440px',
            width: '100%',
            backgroundColor: colors.bg.surface,
            border: `1px solid ${colors.border.default}`,
            borderRadius: radius.lg,
            padding: '32px 24px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px',
          }}
        >
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: radius.md,
              backgroundColor: colors.bg.surfaceSecondary,
              border: `1px solid ${colors.border.default}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: colors.accent.blue,
            }}
          >
            <FolderTree size={24} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <h3 style={{ fontSize: font.size.lg, fontWeight: 600, color: colors.text.primary, margin: 0 }}>
              No Repository Selected
            </h3>
            <p style={{ fontSize: font.size.sm, color: colors.text.secondary, margin: 0, lineHeight: 1.5 }}>
              Open a codebase in the Overview dashboard to explore files, inspect syntax trees, and view cross-file relationships.
            </p>
          </div>

          <Button
            variant="primary"
            size="md"
            onClick={() => navigate('/')}
            style={{ marginTop: '8px' }}
          >
            Open Overview
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex-1 flex overflow-hidden w-full h-full select-none"
      style={{ backgroundColor: colors.bg.primary }}
    >
      {/* ─────────────────────────────────────────────────────────────
          1. LEFT PANE: FILE TREE WORKSPACE
          ───────────────────────────────────────────────────────────── */}
      {showLeftPane && (
        <aside
          style={{
            width: '260px',
            minWidth: '260px',
            height: '100%',
            backgroundColor: colors.bg.surface,
            borderRight: `1px solid ${colors.border.default}`,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          {/* File Tree Header */}
          <div
            style={{
              padding: '10px 12px',
              borderBottom: `1px solid ${colors.border.default}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              height: '42px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <FolderTree size={14} style={{ color: colors.accent.blue }} />
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: colors.text.muted,
                }}
              >
                Explorer
              </span>
            </div>

            <button
              onClick={() => setShowLeftPane(false)}
              style={{
                background: 'none',
                border: 'none',
                color: colors.text.muted,
                cursor: 'pointer',
                padding: '2px',
              }}
              title="Collapse file tree"
            >
              <PanelLeftClose size={14} />
            </button>
          </div>

          {/* Quick File Filter Input */}
          <div style={{ padding: '8px 10px', borderBottom: `1px solid ${colors.border.subtle}` }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 8px',
                backgroundColor: colors.bg.primary,
                border: `1px solid ${colors.border.default}`,
                borderRadius: radius.md,
              }}
            >
              <Filter size={12} style={{ color: colors.text.muted }} />
              <input
                type="text"
                value={fileFilter}
                onChange={(e) => setFileFilter(e.target.value)}
                placeholder="Filter files..."
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  fontSize: '11px',
                  color: colors.text.primary,
                  fontFamily: font.sans,
                }}
              />
            </div>
          </div>

          {/* Tree or Filtered List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 6px' }}>
            {filteredFiles ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {filteredFiles.length === 0 ? (
                  <span style={{ fontSize: '11px', color: colors.text.muted, padding: '12px', textAlign: 'center' }}>
                    No files match "{fileFilter}"
                  </span>
                ) : (
                  filteredFiles.map((f) => {
                    const isSelected = selectedFilePath === f.path;
                    const rel = getRelativePath(f.path, activeRepository);
                    const disambiguated = getDisambiguatedPath(f.path, activeRepository, files);

                    return (
                      <div
                        key={f.path}
                        onClick={() => setSelectedFile(f.path)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '5px 8px',
                          borderRadius: radius.sm,
                          cursor: 'pointer',
                          backgroundColor: isSelected ? colors.bg.surfaceSecondary : 'transparent',
                          color: isSelected ? colors.text.primary : colors.text.secondary,
                          borderLeft: isSelected ? `2px solid ${colors.accent.blue}` : '2px solid transparent',
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) e.currentTarget.style.backgroundColor = colors.bg.surfaceSecondary;
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                      >
                        <FileCode size={13} style={{ color: colors.accent.blue, flexShrink: 0 }} />
                        <span
                          style={{
                            fontSize: '11px',
                            fontFamily: font.mono,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={rel}
                        >
                          {disambiguated}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            ) : fileTree && fileTree.length > 0 ? (
              <FileTree
                nodes={fileTree}
                onSelectFile={(path) => setSelectedFile(path)}
                selectedPath={selectedFilePath}
              />
            ) : files.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {files.map((f) => {
                  const isSelected = selectedFilePath === f.path;
                  const rel = getRelativePath(f.path, activeRepository);
                  const disambiguated = getDisambiguatedPath(f.path, activeRepository, files);
                  return (
                    <div
                      key={f.path}
                      onClick={() => setSelectedFile(f.path)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '5px 8px',
                        borderRadius: radius.sm,
                        cursor: 'pointer',
                        backgroundColor: isSelected ? colors.bg.surfaceSecondary : 'transparent',
                        color: isSelected ? colors.text.primary : colors.text.secondary,
                        borderLeft: isSelected ? `2px solid ${colors.accent.blue}` : '2px solid transparent',
                      }}
                    >
                      <FileCode size={13} style={{ color: colors.accent.blue, flexShrink: 0 }} />
                      <span
                        style={{
                          fontSize: '11px',
                          fontFamily: font.mono,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={rel}
                      >
                        {disambiguated}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ padding: '24px 12px', textAlign: 'center', color: colors.text.muted, fontSize: '12px' }}>
                No files loaded.
              </div>
            )}
          </div>

          {/* Tree Footer: File Stats */}
          <div
            style={{
              padding: '6px 12px',
              borderTop: `1px solid ${colors.border.subtle}`,
              fontSize: '10px',
              color: colors.text.muted,
              fontFamily: font.mono,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>{files.length} source files</span>
            <span>UTF-8</span>
          </div>
        </aside>
      )}

      {/* ─────────────────────────────────────────────────────────────
          2. CENTER PANE: CODE VIEWER WORKSPACE
          ───────────────────────────────────────────────────────────── */}
      <main
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          height: '100%',
          overflow: 'hidden',
          backgroundColor: colors.bg.primary,
        }}
      >
        {/* Code Viewer Toolbar */}
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
            gap: '12px',
          }}
        >
          {/* Left: Expand Left Pane Button + Relative File Path */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            {!showLeftPane && (
              <button
                onClick={() => setShowLeftPane(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: colors.text.muted,
                  cursor: 'pointer',
                  padding: '2px',
                }}
                title="Open file tree"
              >
                <PanelLeftOpen size={16} />
              </button>
            )}

            {selectedFilePath ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                <FileCode size={15} style={{ color: colors.accent.blue, flexShrink: 0 }} />
                {/* Shows parent folder context when multiple files share name */}
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    fontFamily: font.mono,
                    color: colors.text.primary,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={relativeFilePath}
                >
                  {relativeFilePath}
                </span>

                {selectedFileDetail?.language && (
                  <Badge variant="blue">{selectedFileDetail.language}</Badge>
                )}
              </div>
            ) : (
              <span style={{ fontSize: '12px', color: colors.text.muted }}>
                No file selected
              </span>
            )}
          </div>

          {/* Right: Actions & Right Pane Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            {selectedFileDetail && (
              <>
                <button
                  onClick={handleCopyCode}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '3px 8px',
                    borderRadius: radius.sm,
                    backgroundColor: colors.bg.surfaceSecondary,
                    border: `1px solid ${colors.border.default}`,
                    color: copiedCode ? colors.status.success : colors.text.secondary,
                    fontSize: '11px',
                    fontFamily: font.sans,
                    cursor: 'pointer',
                  }}
                  title="Copy file contents"
                >
                  {copiedCode ? <Check size={12} /> : <Copy size={12} />}
                  <span>{copiedCode ? 'Copied' : 'Copy'}</span>
                </button>

                <button
                  onClick={() => handleAskAI('this entire file')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '3px 8px',
                    borderRadius: radius.sm,
                    backgroundColor: colors.bg.surfaceSecondary,
                    border: `1px solid ${colors.border.default}`,
                    color: colors.accent.blue,
                    fontSize: '11px',
                    fontFamily: font.sans,
                    cursor: 'pointer',
                  }}
                  title="Ask assistant to explain this file"
                >
                  <MessageSquare size={12} />
                  <span>Explain File</span>
                </button>
              </>
            )}

            {!showRightPane && selectedFilePath && (
              <button
                onClick={() => setShowRightPane(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: colors.text.muted,
                  cursor: 'pointer',
                  padding: '2px',
                }}
                title="Show symbol & context inspector"
              >
                <PanelRightOpen size={16} />
              </button>
            )}
          </div>
        </header>

        {/* Code Content Area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          {fileLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '10px' }}>
              <Loader2 size={24} className="animate-spin" style={{ color: colors.accent.blue }} />
              <span style={{ fontSize: '12px', color: colors.text.muted, fontFamily: font.mono }}>
                Reading & parsing file contents...
              </span>
            </div>
          ) : selectedFilePath && selectedFileDetail ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {targetLine && (
                <div
                  style={{
                    padding: '4px 10px',
                    borderRadius: radius.sm,
                    backgroundColor: 'rgba(91, 141, 239, 0.1)',
                    border: `1px solid ${colors.accent.blue}`,
                    color: colors.accent.blue,
                    fontSize: '11px',
                    fontFamily: font.mono,
                  }}
                >
                  Targeting Symbol at Line {targetLine}
                </div>
              )}

              <CodeBlock
                code={selectedFileDetail.content}
                language={(selectedFileDetail.language || 'typescript').toLowerCase()}
                fileName={disambiguatedFilename}
              />
            </div>
          ) : (
            /* Empty State */
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                gap: '12px',
                color: colors.text.muted,
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: radius.lg,
                  backgroundColor: colors.bg.surface,
                  border: `1px solid ${colors.border.default}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: colors.accent.blue,
                }}
              >
                <FileCode size={20} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxWidth: '340px' }}>
                <span style={{ fontSize: font.size.sm, fontWeight: 600, color: colors.text.primary }}>
                  No File Selected
                </span>
                <span style={{ fontSize: '12px', color: colors.text.muted, lineHeight: '1.5' }}>
                  Choose a file from the explorer tree to view its source code, examine AST symbols, and inspect import relationships.
                </span>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ─────────────────────────────────────────────────────────────
          3. RIGHT PANE: CONTEXT & SYMBOL INSPECTOR
          ───────────────────────────────────────────────────────────── */}
      {showRightPane && selectedFilePath && (
        <aside
          style={{
            width: '310px',
            minWidth: '310px',
            height: '100%',
            backgroundColor: colors.bg.surface,
            borderLeft: `1px solid ${colors.border.default}`,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          {/* Header Tabs: Symbols vs Relationships */}
          <div
            style={{
              padding: '0 10px',
              borderBottom: `1px solid ${colors.border.default}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              height: '42px',
            }}
          >
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                onClick={() => setRightTab('symbols')}
                style={{
                  fontSize: '11px',
                  fontWeight: rightTab === 'symbols' ? 600 : 400,
                  padding: '4px 8px',
                  borderRadius: radius.sm,
                  backgroundColor: rightTab === 'symbols' ? colors.bg.surfaceSecondary : 'transparent',
                  color: rightTab === 'symbols' ? colors.text.primary : colors.text.muted,
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Symbols ({entitiesByType.total})
              </button>

              <button
                onClick={() => setRightTab('relationships')}
                style={{
                  fontSize: '11px',
                  fontWeight: rightTab === 'relationships' ? 600 : 400,
                  padding: '4px 8px',
                  borderRadius: radius.sm,
                  backgroundColor: rightTab === 'relationships' ? colors.bg.surfaceSecondary : 'transparent',
                  color: rightTab === 'relationships' ? colors.text.primary : colors.text.muted,
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Relationships
              </button>
            </div>

            <button
              onClick={() => setShowRightPane(false)}
              style={{
                background: 'none',
                border: 'none',
                color: colors.text.muted,
                cursor: 'pointer',
                padding: '2px',
              }}
              title="Collapse inspector"
            >
              <PanelRightClose size={14} />
            </button>
          </div>

          {/* Tab Content Body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
            {/* ── TAB 1: CODE STRUCTURE (SYMBOLS) ── */}
            {rightTab === 'symbols' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {entitiesByType.total === 0 ? (
                  <span style={{ fontSize: '12px', color: colors.text.muted, textAlign: 'center', padding: '24px 0', display: 'block' }}>
                    No exported classes or functions detected in this file.
                  </span>
                ) : (
                  <>
                    {/* Classes */}
                    {entitiesByType.classes.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.08em',
                            color: colors.text.muted,
                          }}
                        >
                          Classes ({entitiesByType.classes.length})
                        </span>
                        {entitiesByType.classes.map((cls, idx) => (
                          <SymbolCard
                            key={idx}
                            symbol={cls}
                            onJump={() => handleJumpToLine(cls.start_line)}
                            onSearch={() => handleSearchReferences(cls.name)}
                            onAskAI={() => handleAskAI(`class ${cls.name}`)}
                          />
                        ))}
                      </div>
                    )}

                    {/* Functions */}
                    {entitiesByType.functions.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.08em',
                            color: colors.text.muted,
                          }}
                        >
                          Functions ({entitiesByType.functions.length})
                        </span>
                        {entitiesByType.functions.map((fn, idx) => (
                          <SymbolCard
                            key={idx}
                            symbol={fn}
                            onJump={() => handleJumpToLine(fn.start_line)}
                            onSearch={() => handleSearchReferences(fn.name)}
                            onAskAI={() => handleAskAI(`function ${fn.name}`)}
                          />
                        ))}
                      </div>
                    )}

                    {/* Methods */}
                    {entitiesByType.methods.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.08em',
                            color: colors.text.muted,
                          }}
                        >
                          Methods ({entitiesByType.methods.length})
                        </span>
                        {entitiesByType.methods.map((m, idx) => (
                          <SymbolCard
                            key={idx}
                            symbol={m}
                            onJump={() => handleJumpToLine(m.start_line)}
                            onSearch={() => handleSearchReferences(m.name)}
                            onAskAI={() => handleAskAI(`method ${m.name}`)}
                          />
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── TAB 2: RELATIONSHIPS CONTEXT PANEL ── */}
            {rightTab === 'relationships' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* Summary Metrics Card */}
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: radius.md,
                    backgroundColor: colors.bg.surfaceSecondary,
                    border: `1px solid ${colors.border.subtle}`,
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '6px',
                    textAlign: 'center',
                  }}
                >
                  <div>
                    <span style={{ fontSize: '10px', color: colors.text.muted, display: 'block' }}>Imports</span>
                    <strong style={{ fontSize: font.size.md, color: colors.text.primary, fontFamily: font.mono }}>
                      {relationships.codeImports.length || relationships.outgoing.length}
                    </strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '10px', color: colors.text.muted, display: 'block' }}>Used by</span>
                    <strong style={{ fontSize: font.size.md, color: colors.text.primary, fontFamily: font.mono }}>
                      {relationships.incoming.length}
                    </strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '10px', color: colors.text.muted, display: 'block' }}>Symbols</span>
                    <strong style={{ fontSize: font.size.md, color: colors.text.primary, fontFamily: font.mono }}>
                      {entitiesByType.total}
                    </strong>
                  </div>
                </div>

                {/* Used by (Incoming Dependencies / Callers) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      color: colors.text.muted,
                    }}
                  >
                    Used By ({relationships.incoming.length})
                  </span>

                  {relationships.incoming.length === 0 ? (
                    <span style={{ fontSize: '11px', color: colors.text.muted, fontStyle: 'italic' }}>
                      No incoming file imports detected in graph analysis.
                    </span>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {relationships.incoming.slice(0, 10).map((caller, idx) => {
                        const relCaller = getRelativePath(caller, activeRepository);
                        return (
                          <div
                            key={idx}
                            onClick={() => {
                              const match = files.find((f) => f.path.replace(/\\/g, '/').endsWith(relCaller));
                              if (match) setSelectedFile(match.path);
                            }}
                            style={{
                              padding: '5px 8px',
                              borderRadius: radius.sm,
                              backgroundColor: colors.bg.surfaceSecondary,
                              border: `1px solid ${colors.border.subtle}`,
                              fontSize: '11px',
                              fontFamily: font.mono,
                              color: colors.text.primary,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                            }}
                            title={`Navigate to ${relCaller}`}
                          >
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {relCaller}
                            </span>
                            <ChevronRight size={12} style={{ color: colors.text.muted, flexShrink: 0 }} />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Depends on (Outgoing Dependencies / Imports) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      color: colors.text.muted,
                    }}
                  >
                    Depends On ({relationships.codeImports.length})
                  </span>

                  {relationships.codeImports.length === 0 ? (
                    <span style={{ fontSize: '11px', color: colors.text.muted, fontStyle: 'italic' }}>
                      No external package or module imports found in this file.
                    </span>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {relationships.codeImports.map((dep, idx) => (
                        <Badge key={idx} variant="default">
                          {dep}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {/* View In Graph Shortcut */}
                <button
                  onClick={() => navigate('/graph')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '8px',
                    borderRadius: radius.md,
                    backgroundColor: colors.bg.surfaceSecondary,
                    border: `1px solid ${colors.border.default}`,
                    color: colors.accent.blue,
                    fontSize: '11px',
                    fontFamily: font.sans,
                    cursor: 'pointer',
                    marginTop: '8px',
                  }}
                >
                  <Share2 size={13} />
                  <span>Open in Dependency Graph</span>
                </button>
              </div>
            )}
          </div>
        </aside>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Subcomponent: Symbol Card with 4 IDE Actions
// ─────────────────────────────────────────────────────────────
interface SymbolCardProps {
  symbol: any;
  onJump: () => void;
  onSearch: () => void;
  onAskAI: () => void;
}

const SymbolCard: React.FC<SymbolCardProps> = ({ symbol, onJump, onSearch, onAskAI }) => {
  return (
    <div
      style={{
        padding: '8px 10px',
        borderRadius: radius.md,
        backgroundColor: colors.bg.surfaceSecondary,
        border: `1px solid ${colors.border.subtle}`,
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
        <span
          style={{
            fontSize: '12px',
            fontWeight: 600,
            fontFamily: font.mono,
            color: colors.text.primary,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={symbol.name}
        >
          {symbol.name}
        </span>

        <span
          style={{
            fontSize: '10px',
            color: colors.text.muted,
            fontFamily: font.mono,
            flexShrink: 0,
          }}
        >
          L{symbol.start_line}–L{symbol.end_line}
        </span>
      </div>

      {symbol.docstring && (
        <span
          style={{
            fontSize: '11px',
            color: colors.text.secondary,
            fontStyle: 'italic',
            lineHeight: '1.4',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
          title={symbol.docstring}
        >
          {symbol.docstring}
        </span>
      )}

      {/* Action Buttons Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          marginTop: '2px',
          borderTop: `1px solid ${colors.border.subtle}`,
          paddingTop: '6px',
        }}
      >
        <button
          onClick={onJump}
          style={{
            background: 'none',
            border: 'none',
            color: colors.accent.blue,
            fontSize: '10px',
            cursor: 'pointer',
            padding: '2px 4px',
            borderRadius: '3px',
          }}
          title="Jump to line in code viewer"
        >
          Jump
        </button>

        <span style={{ color: colors.border.default }}>•</span>

        <button
          onClick={onSearch}
          style={{
            background: 'none',
            border: 'none',
            color: colors.text.muted,
            fontSize: '10px',
            cursor: 'pointer',
            padding: '2px 4px',
            borderRadius: '3px',
          }}
          title="Find references to this symbol"
        >
          References
        </button>

        <span style={{ color: colors.border.default }}>•</span>

        <button
          onClick={onAskAI}
          style={{
            background: 'none',
            border: 'none',
            color: colors.text.muted,
            fontSize: '10px',
            cursor: 'pointer',
            padding: '2px 4px',
            borderRadius: '3px',
          }}
          title="Ask AI assistant about this symbol"
        >
          Ask AI
        </button>
      </div>
    </div>
  );
};
