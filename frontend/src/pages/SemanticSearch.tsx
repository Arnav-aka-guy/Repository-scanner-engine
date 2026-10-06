import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { SearchBar } from '../components/SearchBar';
import { semanticSearch, SearchResponse } from '../services/search';
import { CodeBlock } from '../components/CodeBlock';
import {
  Search,
  FileCode,
  Terminal,
  AlertTriangle,
  Loader2,
  FolderTree,
  Share2,
  MessageSquare,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  Info,
  CheckCircle2,
  Sparkles,
  HelpCircle,
} from 'lucide-react';
import { colors, radius, font } from '../design-system/tokens';
import { Tooltip, Badge, Button, FilePath } from '../design-system/primitives';
import { ErrorCard } from '../components/ErrorCard';

type FilterType = 'all' | 'files' | 'functions' | 'classes' | 'routes' | 'components';

interface MatchEvaluation {
  tier: 'Strong match' | 'Related' | 'Possible match';
  color: string;
  bgColor: string;
  borderColor: string;
  summary: string;
  reasons: string[];
}

/**
 * Evaluates semantic relevance score and context into qualitative match tiers
 * and human-understandable explanation reasons.
 */
function evaluateMatch(
  score: number,
  entityName: string,
  filePath: string,
  entityType: string,
  query: string
): MatchEvaluation {
  const qTerms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  const nameNorm = (entityName || '').toLowerCase();
  const pathNorm = filePath.toLowerCase();
  const reasons: string[] = [];

  // Match reasons detection
  const hasSymbolMatch = qTerms.some((t) => nameNorm.includes(t));
  if (hasSymbolMatch) {
    reasons.push('Symbol name match');
  }

  const hasPathMatch = qTerms.some((t) => pathNorm.includes(t));
  if (hasPathMatch) {
    reasons.push('Module & directory context');
  }

  if (score >= 0.65) {
    reasons.push('High semantic similarity');
  } else if (score >= 0.45) {
    reasons.push('Conceptually related logic');
  } else {
    reasons.push('Partial semantic overlap');
  }

  if (entityType && entityType !== 'file') {
    reasons.push(`${entityType.charAt(0).toUpperCase() + entityType.slice(1)} structure`);
  }

  // Tier classification based on score
  if (score >= 0.60 || (score >= 0.50 && hasSymbolMatch)) {
    return {
      tier: 'Strong match',
      color: colors.status.success,
      bgColor: colors.status.successSubtle,
      borderColor: colors.status.successBorder,
      summary: `Directly aligns with "${query}" and handles core functionality.`,
      reasons: reasons.slice(0, 3),
    };
  }

  if (score >= 0.40) {
    return {
      tier: 'Related',
      color: colors.accent.blue,
      bgColor: colors.accent.blueSubtle,
      borderColor: 'rgba(91, 141, 239, 0.3)',
      summary: `Implements supporting logic related to "${query}".`,
      reasons: reasons.slice(0, 3),
    };
  }

  return {
    tier: 'Possible match',
    color: colors.status.warning,
    bgColor: colors.status.warningSubtle,
    borderColor: colors.status.warningBorder,
    summary: `Contains shared concepts or references to "${query}".`,
    reasons: reasons.slice(0, 3),
  };
}

/** Determines category type of a search result */
function detectCategory(result: any): FilterType {
  const type = (result.entity_type || '').toLowerCase();
  const name = (result.entity_name || '').toLowerCase();
  const path = (result.file_path || '').toLowerCase();

  if (type === 'function' || type === 'method') {
    if (path.includes('route') || path.includes('api') || name.startsWith('get_') || name.startsWith('post_')) {
      return 'routes';
    }
    return 'functions';
  }

  if (type === 'class') {
    if (name.endsWith('view') || name.endsWith('component') || path.includes('components')) {
      return 'components';
    }
    return 'classes';
  }

  if (path.endsWith('.tsx') || path.endsWith('.jsx') || path.includes('/components/')) {
    return 'components';
  }

  if (path.includes('/routes/') || path.includes('/api/')) {
    return 'routes';
  }

  return 'files';
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

export const SemanticSearch: React.FC = () => {
  const navigate = useNavigate();
  const repoPath = useWorkspaceStore((s) => s.activeRepository) || '';
  const searchResultsFromStore = useWorkspaceStore((s) => s.searchResults);
  const lastSearchQuery = useWorkspaceStore((s) => s.lastSearchQuery);
  const setSelectedFile = useWorkspaceStore((s) => s.setSelectedFile);

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [searchResponse, setSearchResponse] = useState<SearchResponse | null>(null);
  const [expandedIndices, setExpandedIndices] = useState<Set<number>>(new Set());
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');

  // Sync if pre-seeded from workspaceStore
  useEffect(() => {
    if (searchResultsFromStore.length > 0 && !searchResponse) {
      setSearchResponse({
        query: lastSearchQuery,
        results: searchResultsFromStore,
        total: searchResultsFromStore.length,
      });
    }
  }, [searchResultsFromStore, lastSearchQuery, searchResponse]);

  const handleSearch = async (query: string) => {
    if (!repoPath) {
      setError('Please select and scan a repository first.');
      return;
    }
    setLoading(true);
    setError(null);
    setExpandedIndices(new Set());
    try {
      const response = await semanticSearch(query, 15, repoPath);
      setSearchResponse(response);
      // Sync into workspaceStore
      useWorkspaceStore.setState({
        searchResults: response.results,
        searchTotal: response.total,
        lastSearchQuery: query,
      });
    } catch (err: any) {
      setError(err.message || 'Semantic search request failed.');
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (idx: number) => {
    setExpandedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  };

  // Filter results
  const filteredResults = useMemo(() => {
    if (!searchResponse?.results) return [];
    if (activeFilter === 'all') return searchResponse.results;
    return searchResponse.results.filter((item) => detectCategory(item) === activeFilter);
  }, [searchResponse, activeFilter]);

  // Action: Open in Repository Explorer
  const handleOpenFile = (path: string) => {
    setSelectedFile(path);
    navigate('/explorer');
  };

  // Action: Show in Dependency Graph
  const handleShowDependencies = (path: string) => {
    navigate('/graph');
  };

  // Action: Ask AI about this result
  const handleAskAI = (entityName: string, path: string, snippet: string) => {
    navigate('/chat');
    setTimeout(() => {
      const store = useWorkspaceStore.getState();
      const relative = getRelativePath(path, repoPath);
      store.sendChatMessage(
        `Explain the purpose and implementation of ${entityName || 'this code'} in ${relative}.`
      );
    }, 100);
  };

  const getLanguageFromPath = (path: string): string => {
    const ext = path.split('.').pop()?.toLowerCase();
    if (ext === 'py') return 'python';
    if (ext === 'js' || ext === 'jsx') return 'javascript';
    if (ext === 'ts' || ext === 'tsx') return 'typescript';
    if (ext === 'json') return 'json';
    if (ext === 'md') return 'markdown';
    return 'python';
  };

  return (
    <div
      className="flex-grow flex flex-col overflow-hidden h-full select-none"
      style={{ backgroundColor: colors.bg.primary }}
    >
      {/* ── 1. Search Header ── */}
      <div
        style={{
          padding: '16px 24px',
          borderBottom: `1px solid ${colors.border.default}`,
          backgroundColor: colors.bg.surface,
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Search size={16} style={{ color: colors.accent.blue }} />
            <h1
              style={{
                fontSize: font.size.base,
                fontWeight: 600,
                color: colors.text.primary,
                fontFamily: font.sans,
                margin: 0,
              }}
            >
              Find code by meaning
            </h1>
            <Tooltip content="Uses 384-dimensional dense vector embeddings generated by all-MiniLM-L6-v2 to understand natural language intent.">
              <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                <Badge variant="default">Semantic Search</Badge>
              </span>
            </Tooltip>
          </div>
          <span style={{ fontSize: '12px', color: colors.text.secondary, fontFamily: font.sans }}>
            Ask a question or describe what you're looking for in plain English.
          </span>
        </div>

        {/* Search Bar Input */}
        <div style={{ width: '100%', maxWidth: '780px' }}>
          <SearchBar
            onSearch={handleSearch}
            loading={loading}
            initialValue={searchResponse?.query || ''}
            placeholder="e.g. 'Where is authentication handled?', 'parse AST files', 'calculate health score'..."
          />
        </div>

        {/* Category Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', paddingTop: '4px' }}>
          <span style={{ fontSize: '11px', color: colors.text.muted, display: 'flex', alignItems: 'center', gap: '4px', marginRight: '4px' }}>
            <SlidersHorizontal size={11} />
            Filter:
          </span>
          {(
            [
              { key: 'all', label: 'All Results' },
              { key: 'files', label: 'Files' },
              { key: 'functions', label: 'Functions' },
              { key: 'classes', label: 'Classes' },
              { key: 'routes', label: 'API Routes' },
              { key: 'components', label: 'Components' },
            ] as const
          ).map((tab) => {
            const isActive = activeFilter === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveFilter(tab.key)}
                style={{
                  fontSize: '11px',
                  fontWeight: isActive ? 600 : 400,
                  fontFamily: font.sans,
                  padding: '3px 9px',
                  borderRadius: radius.md,
                  backgroundColor: isActive ? colors.bg.surfaceSecondary : 'transparent',
                  color: isActive ? colors.text.primary : colors.text.secondary,
                  border: `1px solid ${isActive ? colors.border.strong : colors.border.subtle}`,
                  cursor: 'pointer',
                  transition: 'background-color 0.12s ease',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 2. Results Body ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
        {error && (
          <div style={{ maxWidth: '820px', marginBottom: '16px' }}>
            <ErrorCard
              title="Search Failed"
              whatHappened={error}
              why="Semantic vector search was unable to query embeddings for the repository."
              whatCanIDo={[
                'Verify that the repository embeddings have finished indexing.',
                'Ensure the local or remote embedding provider is active in Settings.',
                'Retry searching with another phrase or keyword.',
              ]}
              onRetry={() => {
                if (lastSearchQuery) handleSearch(lastSearchQuery);
              }}
              retrying={loading}
            />
          </div>
        )}

        {loading ? (
          <div style={{ width: '100%', padding: '60px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
            <Loader2 size={24} className="animate-spin" style={{ color: colors.accent.blue }} />
            <span style={{ fontSize: '13px', color: colors.text.secondary, fontFamily: font.sans }}>
              Scanning semantic embeddings across codebase...
            </span>
          </div>
        ) : !repoPath ? (
          <div style={{ padding: '80px 0', textAlign: 'center', color: colors.text.muted, fontSize: '13px' }}>
            Please scan or open a repository first to search code by meaning.
          </div>
        ) : !searchResponse ? (
          /* Initial Empty State with Suggested Queries */
          <div
            style={{
              maxWidth: '680px',
              margin: '30px auto',
              padding: '24px',
              backgroundColor: colors.bg.surface,
              border: `1px solid ${colors.border.default}`,
              borderRadius: radius.lg,
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={16} style={{ color: colors.accent.blue }} />
              <span style={{ fontSize: '13px', fontWeight: 600, color: colors.text.primary }}>
                Suggested queries to explore this codebase
              </span>
            </div>
            <p style={{ fontSize: '12px', color: colors.text.secondary, margin: 0, lineHeight: 1.5 }}>
              Click any query below to run a semantic search and locate corresponding implementations across files:
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {[
                'Where is authentication handled?',
                'How are repository files scanned?',
                'Find dependency graph construction',
                'Calculate architecture and health scores',
                'Where is AI assistant chat handled?',
                'How are AST symbols extracted?',
              ].map((queryText) => (
                <button
                  key={queryText}
                  onClick={() => handleSearch(queryText)}
                  style={{
                    textAlign: 'left',
                    padding: '8px 12px',
                    borderRadius: radius.md,
                    backgroundColor: colors.bg.surfaceSecondary,
                    border: `1px solid ${colors.border.subtle}`,
                    color: colors.text.primary,
                    fontSize: '12px',
                    fontFamily: font.sans,
                    cursor: 'pointer',
                    transition: 'border-color 0.12s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = colors.accent.blue;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = colors.border.subtle;
                  }}
                >
                  "{queryText}"
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ maxWidth: '820px', width: '100%', display: 'flex', flexDirection: 'column', gap: '14px', margin: '0 auto' }}>
            {/* Summary Bar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingBottom: '8px',
                borderBottom: `1px solid ${colors.border.default}`,
                fontSize: '12px',
                color: colors.text.muted,
                fontFamily: font.sans,
              }}
            >
              <span>
                Results for <strong style={{ color: colors.text.primary }}>"{searchResponse.query}"</strong>
              </span>
              <span>
                Showing {filteredResults.length} of {searchResponse.total} matches
              </span>
            </div>

            {filteredResults.length > 0 ? (
              filteredResults.map((res: any, idx: number) => {
                const isExpanded = expandedIndices.has(idx);
                const relPath = getRelativePath(res.file_path, repoPath);
                const lang = getLanguageFromPath(res.file_path);
                const evaluation = evaluateMatch(
                  res.score || 0,
                  res.entity_name,
                  res.file_path,
                  res.entity_type,
                  searchResponse.query
                );
                const snippet = res.snippet || res.source_code || '';

                return (
                  <div
                    key={idx}
                    style={{
                      padding: '14px 16px',
                      borderRadius: radius.lg,
                      backgroundColor: colors.bg.surface,
                      border: `1px solid ${colors.border.default}`,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                      transition: 'border-color 0.12s ease',
                    }}
                  >
                    {/* Top Row: Symbol name, Match Strength badge, Actions */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ color: colors.accent.blue, display: 'flex', alignItems: 'center' }}>
                            <FileCode size={15} />
                          </span>
                          <span
                            style={{
                              fontSize: font.size.sm,
                              fontWeight: 600,
                              fontFamily: font.mono,
                              color: colors.text.primary,
                            }}
                          >
                            {res.entity_name || relPath.split('/').pop() || 'Module Overview'}
                          </span>
                          {res.entity_type && res.entity_type !== 'file' && (
                            <Badge variant="default">{res.entity_type}</Badge>
                          )}
                        </div>

                        {/* Relative Path */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                          <Terminal size={11} style={{ color: colors.text.muted }} />
                          <FilePath path={relPath} />
                        </div>
                      </div>

                      {/* Right: Match Strength Tier */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
                        <Tooltip content={`Cosine similarity: ${Math.round((res.score || 0) * 100)}%. Indicates neural vector distance between your query and this code snippet.`}>
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 600,
                              fontFamily: font.sans,
                              padding: '2px 8px',
                              borderRadius: radius.sm,
                              backgroundColor: evaluation.bgColor,
                              border: `1px solid ${evaluation.borderColor}`,
                              color: evaluation.color,
                              cursor: 'help',
                            }}
                          >
                            {evaluation.tier}
                          </span>
                        </Tooltip>
                        <span style={{ fontSize: '10px', color: colors.text.muted, fontFamily: font.mono }}>
                          {Math.round((res.score || 0) * 100)}% relevance
                        </span>
                      </div>
                    </div>

                    {/* Why It Matched Section */}
                    <div
                      style={{
                        padding: '8px 10px',
                        borderRadius: radius.md,
                        backgroundColor: colors.bg.surfaceSecondary,
                        border: `1px solid ${colors.border.subtle}`,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                        <span style={{ fontSize: '11px', color: colors.text.secondary, fontStyle: 'italic' }}>
                          "{evaluation.summary}"
                        </span>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {evaluation.reasons.map((r, rIdx) => (
                            <span
                              key={rIdx}
                              style={{
                                fontSize: '10px',
                                padding: '1px 5px',
                                borderRadius: radius.sm,
                                backgroundColor: colors.bg.primary,
                                border: `1px solid ${colors.border.default}`,
                                color: colors.text.muted,
                                fontFamily: font.sans,
                              }}
                            >
                              • {r}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Code Snippet */}
                    {snippet && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {isExpanded ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <CodeBlock
                              code={snippet}
                              language={lang}
                              fileName={relPath.split('/').pop() || ''}
                            />
                            <button
                              onClick={() => toggleExpand(idx)}
                              style={{
                                fontSize: '11px',
                                color: colors.accent.blue,
                                alignSelf: 'flex-end',
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '3px',
                                padding: '2px 4px',
                              }}
                            >
                              <ChevronUp size={12} />
                              Collapse Snippet
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <pre
                              onClick={() => toggleExpand(idx)}
                              style={{
                                margin: 0,
                                padding: '8px 12px',
                                borderRadius: radius.md,
                                backgroundColor: colors.bg.primary,
                                border: `1px solid ${colors.border.subtle}`,
                                color: colors.text.secondary,
                                fontSize: '11px',
                                fontFamily: font.mono,
                                maxHeight: '68px',
                                overflow: 'hidden',
                                cursor: 'pointer',
                                lineHeight: 1.5,
                              }}
                            >
                              {snippet}
                            </pre>
                            <button
                              onClick={() => toggleExpand(idx)}
                              style={{
                                fontSize: '11px',
                                color: colors.accent.blue,
                                alignSelf: 'flex-start',
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '3px',
                                padding: '2px 4px',
                              }}
                            >
                              <ChevronDown size={12} />
                              Expand Snippet
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Bottom Action Buttons */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        gap: '8px',
                        borderTop: `1px solid ${colors.border.subtle}`,
                        paddingTop: '8px',
                      }}
                    >
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleOpenFile(res.file_path)}
                        icon={<ExternalLink size={12} />}
                      >
                        Open
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleShowDependencies(res.file_path)}
                        icon={<Share2 size={12} />}
                      >
                        Show dependencies
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleAskAI(res.entity_name, res.file_path, snippet)}
                        icon={<MessageSquare size={12} />}
                      >
                        Ask AI
                      </Button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div style={{ padding: '40px 0', textAlign: 'center', color: colors.text.muted, fontSize: '13px' }}>
                No results match the "{activeFilter}" filter for "{searchResponse.query}".
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
