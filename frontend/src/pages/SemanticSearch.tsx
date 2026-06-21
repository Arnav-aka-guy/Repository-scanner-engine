import React, { useState } from 'react';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { SearchBar } from '../components/SearchBar';
import { semanticSearch, SearchResponse } from '../services/search';
import { CodeBlock } from '../components/CodeBlock';
import { Sparkles, Terminal, FileCode, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';

export const SemanticSearch: React.FC = () => {
  const repoPath = useWorkspaceStore((s) => s.activeRepository) || '';
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [searchResponse, setSearchResponse] = useState<SearchResponse | null>(null);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const handleSearch = async (query: string) => {
    if (!repoPath) {
      setError('Please select and scan a repository first.');
      return;
    }
    setLoading(true);
    setError(null);
    setExpandedIndex(null);
    try {
      const response = await semanticSearch(query);
      setSearchResponse(response);
    } catch (err: any) {
      setError(err.message || 'Semantic search request failed.');
    } finally {
      setLoading(false);
    }
  };

  const formatRelevanceScore = (score: number): string => {
    // FAISS Inner Product yields cosine similarity between 0 and 1 for normalized vectors
    const percentage = Math.round(score * 100);
    return `${Math.max(0, Math.min(100, percentage))}% relevance`;
  };

  const getLanguageFromPath = (path: string): string => {
    const ext = path.split('.').pop()?.toLowerCase();
    if (ext === 'py') return 'python';
    if (ext === 'js' || ext === 'jsx') return 'javascript';
    if (ext === 'ts' || ext === 'tsx') return 'typescript';
    return 'python';
  };

  return (
    <div className="flex-grow flex flex-col overflow-hidden h-full">
      {/* 1. Centered Search Form area */}
      <div
        className="px-6 py-6 border-b flex flex-col gap-4 select-none"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderColor: 'var(--border-color)',
        }}
      >
        <div className="flex items-center gap-2">
          <span className="text-[var(--accent-primary)]"><Sparkles size={20} /></span>
          <h1 className="text-sm font-bold uppercase tracking-wider text-[var(--text-primary)]">
            Semantic Code Search Engine
          </h1>
        </div>

        <div className="max-w-3xl w-full">
          <SearchBar onSearch={handleSearch} loading={loading} />
        </div>
      </div>

      {/* 2. Results list */}
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        {error && (
          <div className="max-w-3xl mb-5 p-3 bg-red-950/20 border border-red-500/30 rounded-lg flex items-center gap-3 text-red-300 text-xs">
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="w-full py-20 flex flex-col items-center justify-center gap-3">
            <Loader2 size={32} className="animate-spin text-[var(--accent-primary)]" />
            <span className="text-sm font-semibold font-mono text-[var(--text-secondary)]">
              Querying vector model embeddings ...
            </span>
          </div>
        ) : !repoPath ? (
          <div className="w-full py-20 flex flex-col items-center justify-center gap-2 italic text-sm text-[var(--text-muted)] select-none">
            Please select and scan a repository in the Explorer view to query semantic searches.
          </div>
        ) : searchResponse ? (
          <div className="max-w-3xl w-full flex flex-col gap-4">
            {/* Header: results count */}
            <div className="flex items-center justify-between text-xs text-[var(--text-muted)] font-mono border-b pb-2 select-none" style={{ borderColor: 'var(--border-color)' }}>
              <span>Search query: "{searchResponse.query}"</span>
              <span>Found {searchResponse.total} matches</span>
            </div>

            {searchResponse.results?.length > 0 ? (
              <div className="flex flex-col gap-4">
                {searchResponse.results.map((res, idx) => {
                  const isExpanded = expandedIndex === idx;
                  const lang = getLanguageFromPath(res.file_path);
                  return (
                    <div
                      key={idx}
                      className="p-5 rounded-xl border flex flex-col gap-3 transition-all relative overflow-hidden"
                      style={{
                        backgroundColor: 'var(--bg-secondary)',
                        borderColor: 'var(--border-color)',
                      }}
                    >
                      {/* Top Header */}
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[var(--accent-purple)] flex-shrink-0">
                            <FileCode size={16} />
                          </span>
                          <span className="text-sm font-bold font-mono truncate text-[var(--text-primary)]">
                            {res.entity_name || 'Module Overview'}
                          </span>
                        </div>

                        <span
                          className="text-[10px] font-bold font-mono px-2 py-0.5 rounded border flex-shrink-0"
                          style={{
                            backgroundColor: 'rgba(166, 227, 161, 0.05)',
                            borderColor: 'rgba(166, 227, 161, 0.2)',
                            color: 'var(--accent-green)',
                          }}
                        >
                          {formatRelevanceScore(res.score)}
                        </span>
                      </div>

                      {/* Info: File Path */}
                      <div className="flex items-center gap-1.5 font-mono text-[10px] text-[var(--text-muted)]">
                        <Terminal size={12} />
                        <span className="truncate break-all select-all bg-slate-950/20 px-2 py-0.5 rounded border border-slate-800">
                          {res.file_path}
                        </span>
                      </div>

                      {/* Snippet display / toggler */}
                      {res.source_code && (
                        <div className="w-full mt-1.5">
                          {isExpanded ? (
                            <div className="flex flex-col gap-2">
                              <CodeBlock
                                code={res.source_code}
                                language={lang}
                                fileName={res.file_path.split(/[\\/]+/).pop() || ''}
                              />
                              <button
                                onClick={() => setExpandedIndex(null)}
                                className="text-xs text-[var(--accent-primary)] hover:underline self-end font-semibold pt-1 font-sans"
                              >
                                Collapse Code Snippet
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-2.5">
                              {/* Simple preview box */}
                              <pre
                                className="p-3.5 rounded-lg border font-mono text-xs overflow-hidden leading-relaxed text-[var(--text-secondary)] cursor-pointer select-none"
                                style={{
                                  backgroundColor: 'var(--bg-primary)',
                                  borderColor: 'var(--border-color)',
                                  maxHeight: '74px',
                                }}
                                onClick={() => setExpandedIndex(idx)}
                              >
                                {res.source_code}
                              </pre>
                              <button
                                onClick={() => setExpandedIndex(idx)}
                                className="text-xs text-[var(--accent-primary)] hover:underline self-start font-semibold font-sans"
                              >
                                Expand Code Snippet
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-16 text-sm text-[var(--text-muted)] italic select-none">
                No semantic matches found for this query. Try rephrasing your search terms.
              </div>
            )}
          </div>
        ) : (
          <div className="w-full py-20 flex flex-col items-center justify-center gap-2 italic text-sm text-[var(--text-muted)] select-none">
            Type a natural language query in the bar above (e.g. "authentication service methods") to search codebases.
          </div>
        )}
      </div>
    </div>
  );
};
