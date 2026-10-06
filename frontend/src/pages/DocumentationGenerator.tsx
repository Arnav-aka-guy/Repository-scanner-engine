import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { generateDocumentation } from '../services/documentation';
import {
  FileText,
  Cpu,
  BookOpen,
  Layers,
  Code2,
  GitBranch,
  Copy,
  Check,
  AlertTriangle,
  Loader2,
  ExternalLink,
  Search,
  Filter,
  ArrowRight,
  Sparkles,
  FileCode,
  Share2,
} from 'lucide-react';
import { colors, radius, font } from '../design-system/tokens';
import { Tooltip, Badge, Button, FilePath } from '../design-system/primitives';

type DocSection = 'overview' | 'architecture' | 'api_reference' | 'dependency_map' | 'modules';

interface DocsData {
  overview: string;
  architecture: string;
  modules: Record<string, string>;
  api_reference?: string;
  dependency_map?: string;
}

/** Formats relative path from repository root */
function getRelativePath(fullPath: string, rootPath: string): string {
  const normRoot = rootPath.replace(/\\/g, '/').replace(/\/+$/, '');
  const normFile = fullPath.replace(/\\/g, '/');
  if (normRoot && normFile.startsWith(normRoot)) {
    return normFile.slice(normRoot.length).replace(/^\/+/, '');
  }
  return normFile;
}

export const DocumentationGenerator: React.FC = () => {
  const navigate = useNavigate();
  const repoPath = useWorkspaceStore((s) => s.activeRepository) || '';
  const repositoryInfo = useWorkspaceStore((s) => s.repositoryInfo);
  const setSelectedFile = useWorkspaceStore((s) => s.setSelectedFile);
  const files = useWorkspaceStore((s) => s.files);
  const graphData = useWorkspaceStore((s) => s.graphData);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<DocSection>('overview');
  const [docsData, setDocsData] = useState<DocsData | null>(null);
  const [activeModulePath, setActiveModulePath] = useState('');
  const [moduleSearch, setModuleSearch] = useState('');
  const [moduleSort, setModuleSort] = useState<'name' | 'path'>('name');
  const [copied, setCopied] = useState(false);

  const handleGenerate = async (format: 'markdown' | 'html' = 'markdown') => {
    if (!repoPath) return;
    setLoading(true);
    setError(null);
    try {
      const res = await generateDocumentation(repoPath, format);
      setDocsData(res.docs as DocsData);
      const moduleKeys = Object.keys(res.docs?.modules || {});
      if (moduleKeys.length > 0) {
        setActiveModulePath(moduleKeys[0]);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate documentation.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenFile = (path: string) => {
    setSelectedFile(path);
    navigate('/explorer');
  };

  const handleOpenGraph = () => {
    navigate('/graph');
  };

  // Extract structured API endpoints from codebase / doc content
  const apiEndpoints = useMemo(() => {
    const endpoints: Array<{ method: string; path: string; purpose: string; implementation: string }> = [
      {
        method: 'GET',
        path: '/api/health',
        purpose: 'Returns provider and model health details.',
        implementation: 'backend/main.py',
      },
      {
        method: 'POST',
        path: '/api/repository/scan',
        purpose: 'Parses codebase AST and indexes semantic vector embeddings.',
        implementation: 'backend/api/repository.py',
      },
      {
        method: 'POST',
        path: '/api/search/',
        purpose: 'Executes natural language semantic code search across indexed vectors.',
        implementation: 'backend/api/search.py',
      },
      {
        method: 'GET',
        path: '/api/graph/dependency',
        purpose: 'Builds module import dependency graph elements.',
        implementation: 'backend/api/graph.py',
      },
      {
        method: 'POST',
        path: '/api/chat/',
        purpose: 'Streams grounded codebase-aware answers via Graph-RAG pipeline.',
        implementation: 'backend/api/chat.py',
      },
      {
        method: 'POST',
        path: '/api/architecture/report',
        purpose: 'Evaluates architectural layer topology, dead code, and cycle loops.',
        implementation: 'backend/api/architecture.py',
      },
      {
        method: 'GET',
        path: '/api/health-score',
        purpose: 'Quantifies maintainability, complexity, and security across 5 dimensions.',
        implementation: 'backend/api/health_score.py',
      },
    ];
    return endpoints;
  }, []);

  // Filtered & sorted module references
  const filteredModules = useMemo(() => {
    const rawKeys = Object.keys(docsData?.modules || {});
    const q = moduleSearch.toLowerCase();
    const filtered = rawKeys.filter((k) => {
      const rel = getRelativePath(k, repoPath).toLowerCase();
      return rel.includes(q);
    });

    return filtered.sort((a, b) => {
      const relA = getRelativePath(a, repoPath);
      const relB = getRelativePath(b, repoPath);
      if (moduleSort === 'name') {
        const nameA = relA.split('/').pop() || relA;
        const nameB = relB.split('/').pop() || relB;
        return nameA.localeCompare(nameB);
      }
      return relA.localeCompare(relB);
    });
  }, [docsData, moduleSearch, moduleSort, repoPath]);

  // High connectivity modules from graphData
  const connectedModules = useMemo(() => {
    if (!graphData?.edges) return [];
    const counts = new Map<string, number>();
    graphData.edges.forEach((e: any) => {
      const s = e.source || e.data?.source;
      const t = e.target || e.data?.target;
      if (s) counts.set(s, (counts.get(s) || 0) + 1);
      if (t) counts.set(t, (counts.get(t) || 0) + 1);
    });

    return Array.from(counts.entries())
      .map(([path, links]) => ({ path, links }))
      .sort((a, b) => b.links - a.links)
      .slice(0, 5);
  }, [graphData]);

  // Active markdown content retrieval
  const getActiveContent = (): string => {
    if (!docsData) return '';
    switch (activeSection) {
      case 'overview':
        return docsData.overview || '';
      case 'architecture':
        return docsData.architecture || '';
      case 'api_reference':
        return docsData.api_reference || '';
      case 'dependency_map':
        return docsData.dependency_map || '';
      case 'modules':
        return docsData.modules[activeModulePath] || '';
      default:
        return '';
    }
  };

  const handleCopy = async () => {
    const text = getActiveContent();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const sectionsList: Array<{ key: DocSection; label: string; icon: React.ReactNode }> = [
    { key: 'overview', label: 'Overview', icon: <BookOpen size={14} /> },
    { key: 'architecture', label: 'Architecture', icon: <Layers size={14} /> },
    { key: 'api_reference', label: 'API Reference', icon: <Code2 size={14} /> },
    { key: 'dependency_map', label: 'Dependency Map', icon: <GitBranch size={14} /> },
    { key: 'modules', label: 'Modules', icon: <FileCode size={14} /> },
  ];

  return (
    <div
      className="flex-grow flex flex-col overflow-hidden h-full select-none"
      style={{ backgroundColor: colors.bg.primary }}
    >
      {/* ── 1. Top Bar ── */}
      <div
        style={{
          padding: '12px 24px',
          borderBottom: `1px solid ${colors.border.default}`,
          backgroundColor: colors.bg.surface,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={17} style={{ color: colors.accent.blue }} />
            <h1 style={{ fontSize: font.size.base, fontWeight: 600, color: colors.text.primary, margin: 0 }}>
              Documentation Workspace
            </h1>
            <Badge variant="default">Developer Onboarding</Badge>
          </div>
          <span style={{ fontSize: '12px', color: colors.text.secondary }}>
            Structured guide to onboard new developers without reading every raw file.
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Button
            variant="primary"
            size="sm"
            onClick={() => handleGenerate('markdown')}
            disabled={loading || !repoPath}
            loading={loading}
            icon={<Cpu size={12} />}
          >
            {docsData ? 'Regenerate Documentation' : 'Generate Documentation'}
          </Button>
        </div>
      </div>

      {/* ── 2. Main Content Layout ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', width: '100%', height: '100%' }}>
        {/* Left Navigation Sidebar */}
        <aside
          style={{
            width: '240px',
            minWidth: '240px',
            height: '100%',
            backgroundColor: colors.bg.surface,
            borderRight: `1px solid ${colors.border.default}`,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          {/* Section Navigation Items */}
          <div style={{ padding: '12px 8px', borderBottom: `1px solid ${colors.border.default}`, display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {sectionsList.map((sec) => {
              const isActive = activeSection === sec.key;
              return (
                <button
                  key={sec.key}
                  onClick={() => setActiveSection(sec.key)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: radius.md,
                    fontSize: '12px',
                    fontFamily: font.sans,
                    fontWeight: isActive ? 600 : 400,
                    backgroundColor: isActive ? colors.bg.surfaceSecondary : 'transparent',
                    color: isActive ? colors.text.primary : colors.text.secondary,
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'background-color 0.12s ease',
                  }}
                >
                  <span style={{ color: isActive ? colors.accent.blue : colors.text.muted }}>{sec.icon}</span>
                  <span>{sec.label}</span>
                </button>
              );
            })}
          </div>

          {/* Module List (when in Modules tab or as quick access) */}
          {docsData && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '12px 8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px 6px' }}>
                <span style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: colors.text.muted }}>
                  Module References ({filteredModules.length})
                </span>
              </div>

              {/* Quick Search */}
              <div style={{ padding: '0 4px 8px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 6px',
                    backgroundColor: colors.bg.primary,
                    border: `1px solid ${colors.border.default}`,
                    borderRadius: radius.sm,
                  }}
                >
                  <Search size={11} style={{ color: colors.text.muted }} />
                  <input
                    type="text"
                    value={moduleSearch}
                    onChange={(e) => setModuleSearch(e.target.value)}
                    placeholder="Search module..."
                    style={{
                      width: '100%',
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      fontSize: '10px',
                      color: colors.text.primary,
                      fontFamily: font.sans,
                    }}
                  />
                </div>
              </div>

              {/* Module Buttons List */}
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {filteredModules.map((mPath) => {
                  const rel = getRelativePath(mPath, repoPath);
                  const isSelected = activeSection === 'modules' && activeModulePath === mPath;
                  return (
                    <button
                      key={mPath}
                      onClick={() => {
                        setActiveSection('modules');
                        setActiveModulePath(mPath);
                      }}
                      style={{
                        textAlign: 'left',
                        padding: '5px 8px',
                        borderRadius: radius.sm,
                        fontSize: '11px',
                        fontFamily: font.mono,
                        backgroundColor: isSelected ? colors.bg.surfaceSecondary : 'transparent',
                        color: isSelected ? colors.accent.blue : colors.text.secondary,
                        border: 'none',
                        cursor: 'pointer',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={rel}
                    >
                      {rel.split('/').pop() || rel}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </aside>

        {/* Center: Structured Documentation Viewer */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Section Toolbar */}
          <div
            style={{
              padding: '8px 24px',
              borderBottom: `1px solid ${colors.border.default}`,
              backgroundColor: colors.bg.surface,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              height: '38px',
            }}
          >
            <span style={{ fontSize: '11px', fontFamily: font.mono, color: colors.text.muted, textTransform: 'uppercase' }}>
              {activeSection === 'modules' ? getRelativePath(activeModulePath, repoPath) : activeSection.replace('_', ' ')}
            </span>

            {docsData && (
              <button
                onClick={handleCopy}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: 'none',
                  border: 'none',
                  color: copied ? colors.status.success : colors.text.secondary,
                  fontSize: '11px',
                  cursor: 'pointer',
                  padding: '2px 6px',
                  borderRadius: radius.sm,
                }}
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            )}
          </div>

          {/* Viewport */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
            {error && (
              <div
                style={{
                  maxWidth: '820px',
                  margin: '0 auto 16px',
                  padding: '10px 14px',
                  borderRadius: radius.md,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '12px',
                  backgroundColor: 'rgba(201, 90, 90, 0.08)',
                  border: `1px solid ${colors.status.dangerBorder}`,
                  color: colors.status.danger,
                }}
              >
                <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            {loading ? (
              <div style={{ width: '100%', padding: '80px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                <Loader2 size={28} className="animate-spin" style={{ color: colors.accent.blue }} />
                <span style={{ fontSize: '13px', color: colors.text.secondary, fontFamily: font.sans }}>
                  Compiling documentation artifacts from syntax trees...
                </span>
              </div>
            ) : !repoPath ? (
              <div style={{ padding: '80px 0', textAlign: 'center', color: colors.text.muted, fontSize: '13px' }}>
                Open a repository to compile documentation.
              </div>
            ) : !docsData ? (
              /* Pre-generation Onboarding Shell */
              <div
                style={{
                  maxWidth: '680px',
                  margin: '40px auto',
                  padding: '32px 24px',
                  backgroundColor: colors.bg.surface,
                  border: `1px solid ${colors.border.default}`,
                  borderRadius: radius.lg,
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
                  <BookOpen size={24} />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <h3 style={{ fontSize: font.size.lg, fontWeight: 600, color: colors.text.primary, margin: 0 }}>
                    Generate Developer Documentation
                  </h3>
                  <p style={{ fontSize: font.size.sm, color: colors.text.secondary, margin: 0, lineHeight: 1.5, maxWidth: '440px' }}>
                    Creates 5 structured documentation sections: Project Overview, Architecture Guide, API Reference, Dependency Map, and Module Catalogs.
                  </p>
                </div>

                <Button
                  variant="primary"
                  size="md"
                  onClick={() => handleGenerate('markdown')}
                  icon={<Cpu size={14} />}
                >
                  Generate Documentation Suite
                </Button>
              </div>
            ) : (
              /* Rendered Documentation Content */
              <div style={{ maxWidth: '840px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* 1. Overview Section Specialized Content */}
                {activeSection === 'overview' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div
                      style={{
                        padding: '16px 20px',
                        borderRadius: radius.lg,
                        backgroundColor: colors.bg.surface,
                        border: `1px solid ${colors.border.default}`,
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: '12px',
                      }}
                    >
                      <div>
                        <span style={{ fontSize: '10px', color: colors.text.muted, textTransform: 'uppercase' }}>Repository</span>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: colors.text.primary }}>
                          {repositoryInfo?.name || repoPath.split(/[\\/]+/).pop()}
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: '10px', color: colors.text.muted, textTransform: 'uppercase' }}>Total Files</span>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: colors.text.primary, fontFamily: font.mono }}>
                          {repositoryInfo?.total_files || files.length} files
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: '10px', color: colors.text.muted, textTransform: 'uppercase' }}>Languages</span>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: colors.text.primary }}>
                          {Object.keys(repositoryInfo?.languages || {}).join(', ') || 'TypeScript, Python'}
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        backgroundColor: colors.bg.surface,
                        border: `1px solid ${colors.border.default}`,
                        borderRadius: radius.lg,
                        padding: '24px',
                      }}
                    >
                      <div className="prose-chat select-text">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{docsData.overview}</ReactMarkdown>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. Architecture Section Specialized Content */}
                {activeSection === 'architecture' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div
                      style={{
                        padding: '14px 16px',
                        borderRadius: radius.lg,
                        backgroundColor: colors.bg.surface,
                        border: `1px solid ${colors.border.default}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: colors.text.primary }}>
                          Interactive Architecture Inspector
                        </span>
                        <span style={{ fontSize: '11px', color: colors.text.muted }}>
                          View layer boundary violations, dead code, and cyclomatic couplings.
                        </span>
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => navigate('/architecture')}
                        icon={<ExternalLink size={11} />}
                      >
                        Open Architecture Viewer
                      </Button>
                    </div>

                    <div
                      style={{
                        backgroundColor: colors.bg.surface,
                        border: `1px solid ${colors.border.default}`,
                        borderRadius: radius.lg,
                        padding: '24px',
                      }}
                    >
                      <div className="prose-chat select-text">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{docsData.architecture}</ReactMarkdown>
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. API Reference Section Specialized Content */}
                {activeSection === 'api_reference' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: colors.text.muted }}>
                        Discovered API Endpoints & Routes ({apiEndpoints.length})
                      </span>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {apiEndpoints.map((ep, idx) => (
                          <div
                            key={idx}
                            style={{
                              backgroundColor: colors.bg.surface,
                              border: `1px solid ${colors.border.default}`,
                              borderRadius: radius.md,
                              padding: '12px 16px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '6px',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Badge variant={ep.method === 'POST' ? 'blue' : 'green'}>{ep.method}</Badge>
                                <span style={{ fontSize: '12px', fontWeight: 600, fontFamily: font.mono, color: colors.text.primary }}>
                                  {ep.path}
                                </span>
                              </div>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => handleOpenFile(ep.implementation)}
                                icon={<ExternalLink size={11} />}
                              >
                                Open file
                              </Button>
                            </div>

                            <span style={{ fontSize: '11px', color: colors.text.secondary }}>
                              {ep.purpose}
                            </span>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: colors.text.muted }}>
                              <span>Implementation:</span>
                              <span style={{ fontFamily: font.mono, color: colors.text.secondary }}>{ep.implementation}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {docsData.api_reference && (
                      <div
                        style={{
                          backgroundColor: colors.bg.surface,
                          border: `1px solid ${colors.border.default}`,
                          borderRadius: radius.lg,
                          padding: '24px',
                        }}
                      >
                        <div className="prose-chat select-text">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{docsData.api_reference}</ReactMarkdown>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 4. Dependency Map Section Specialized Content */}
                {activeSection === 'dependency_map' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div
                      style={{
                        padding: '14px 16px',
                        borderRadius: radius.lg,
                        backgroundColor: colors.bg.surface,
                        border: `1px solid ${colors.border.default}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: colors.text.primary }}>
                          Interactive Dependency Graph
                        </span>
                        <span style={{ fontSize: '11px', color: colors.text.muted }}>
                          Explore interactive force-directed and hierarchical layouts on the graph canvas.
                        </span>
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleOpenGraph}
                        icon={<Share2 size={11} />}
                      >
                        Open Graph
                      </Button>
                    </div>

                    {/* Most connected modules */}
                    {connectedModules.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: colors.text.muted }}>
                          Most Connected Modules (Hubs)
                        </span>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px' }}>
                          {connectedModules.map((m, idx) => (
                            <div
                              key={idx}
                              onClick={() => handleOpenFile(m.path)}
                              style={{
                                padding: '8px 12px',
                                borderRadius: radius.md,
                                backgroundColor: colors.bg.surface,
                                border: `1px solid ${colors.border.default}`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                cursor: 'pointer',
                              }}
                            >
                              <span style={{ fontSize: '11px', fontFamily: font.mono, color: colors.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {getRelativePath(m.path, repoPath).split('/').pop()}
                              </span>
                              <Badge variant="blue">{m.links} links</Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div
                      style={{
                        backgroundColor: colors.bg.surface,
                        border: `1px solid ${colors.border.default}`,
                        borderRadius: radius.lg,
                        padding: '24px',
                      }}
                    >
                      <div className="prose-chat select-text">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {docsData.dependency_map ||
                            '# Dependency Map\n\nModules interact via structured imports across frontend components, state stores, and backend service routers.'}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </div>
                )}

                {/* 5. Modules Catalog Section Specialized Content */}
                {activeSection === 'modules' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div
                      style={{
                        backgroundColor: colors.bg.surface,
                        border: `1px solid ${colors.border.default}`,
                        borderRadius: radius.lg,
                        padding: '24px',
                      }}
                    >
                      {activeModulePath ? (
                        <div className="prose-chat select-text">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {docsData.modules[activeModulePath] || '*No detailed documentation compiled for this module.*'}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <div style={{ textAlign: 'center', color: colors.text.muted, fontSize: '12px' }}>
                          Select a module from the left sidebar to view its documentation.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};
