import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { ChatMessage } from '../components/ChatMessage';
import { ChatInput } from '../components/ChatInput';
import {
  Bot,
  AlertTriangle,
  Trash2,
  Sparkles,
  FileCode,
  Share2,
  Layers,
  ChevronRight,
  ExternalLink,
  PanelRightClose,
  PanelRightOpen,
  Info,
  Database,
  Hash,
} from 'lucide-react';
import { colors, radius, font } from '../design-system/tokens';
import { Tooltip, Badge, Button, FilePath } from '../design-system/primitives';
import { ErrorCard } from '../components/ErrorCard';

/** Formats relative path from repository root */
function getRelativePath(fullPath: string, rootPath: string): string {
  const normRoot = rootPath.replace(/\\/g, '/').replace(/\/+$/, '');
  const normFile = fullPath.replace(/\\/g, '/');
  if (normRoot && normFile.startsWith(normRoot)) {
    return normFile.slice(normRoot.length).replace(/^\/+/, '');
  }
  return normFile;
}

export const AIChat: React.FC = () => {
  const navigate = useNavigate();
  const repoPath = useWorkspaceStore((s) => s.activeRepository) || '';
  const repositoryInfo = useWorkspaceStore((s) => s.repositoryInfo);
  const messages = useWorkspaceStore((s) => s.chatMessages);
  const loading = useWorkspaceStore((s) => s.chatLoading);
  const error = useWorkspaceStore((s) => s.chatError);
  const sendMessage = useWorkspaceStore((s) => s.sendChatMessage);
  const clearHistory = useWorkspaceStore((s) => s.clearChatHistory);
  const loadPersistentChatHistory = useWorkspaceStore((s) => s.loadPersistentChatHistory);
  const setSelectedFile = useWorkspaceStore((s) => s.setSelectedFile);
  const files = useWorkspaceStore((s) => s.files);
  const graphData = useWorkspaceStore((s) => s.graphData);

  const [showContextPane, setShowContextPane] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load persistent chat history on mount if store has no messages
  useEffect(() => {
    if (repoPath && messages.length === 0) {
      loadPersistentChatHistory();
    }
  }, [repoPath, messages.length, loadPersistentChatHistory]);

  // Auto-scroll chat box to bottom on messages updates
  useEffect(() => {
    if (typeof messagesEndRef.current?.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading]);

  const handleSend = (text: string) => {
    if (repoPath) {
      sendMessage(text);
    }
  };

  const handleSuggestionClick = (query: string) => {
    if (repoPath && !loading) {
      sendMessage(query);
    }
  };

  const handleOpenSource = (path: string) => {
    setSelectedFile(path);
    navigate('/explorer');
  };

  const handleRunAction = (actionText: string) => {
    if (actionText.includes('Explorer')) {
      navigate('/explorer');
    } else if (actionText.includes('Graph')) {
      navigate('/graph');
    } else if (actionText.includes('security') || actionText.includes('Health')) {
      navigate('/health-dashboard');
    }
  };

  // Extract all sources referenced across conversation
  const contextUsed = useMemo(() => {
    const filesUsed: Set<string> = new Set();
    const symbolsUsed: Set<string> = new Set();

    messages.forEach((m) => {
      if (m.sources) {
        m.sources.forEach((s) => {
          if (s.file_path) filesUsed.add(s.file_path);
          if (s.entity_name) symbolsUsed.add(s.entity_name);
        });
      }
      // Pattern match file paths in text
      const matches = m.content.match(/\b([a-zA-Z0-9_\-./]+\.(?:ts|tsx|js|jsx|py|json|md))\b/g);
      if (matches) {
        matches.forEach((p) => {
          if (p.includes('/') || p.includes('.')) filesUsed.add(p);
        });
      }
    });

    return {
      files: Array.from(filesUsed).slice(0, 10),
      symbols: Array.from(symbolsUsed).slice(0, 8),
      relationshipsCount: graphData?.edges?.length || 0,
    };
  }, [messages, graphData]);

  // PRD Phase 9 Starter Questions
  const starterQuestions = [
    'Explain this repository',
    'Where does the application start?',
    'How does authentication work?',
    'What are the most important files?',
    'What should I fix first?',
    'How does data flow through the application?',
  ];

  return (
    <div
      className="flex-grow flex flex-col overflow-hidden h-full select-none"
      style={{ backgroundColor: colors.bg.primary }}
    >
      {/* ── 1. Header ── */}
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
            <span style={{ color: colors.accent.blue, display: 'flex', alignItems: 'center' }}>
              <Bot size={17} />
            </span>
            <h1
              style={{
                fontSize: font.size.base,
                fontWeight: 600,
                color: colors.text.primary,
                fontFamily: font.sans,
                margin: 0,
              }}
            >
              Repository Assistant
            </h1>
            <Badge variant="default">Repository-Aware AI</Badge>
          </div>
          <span style={{ fontSize: '12px', color: colors.text.secondary }}>
            Ask questions about this codebase. Answers are grounded in the repository's files, symbols and relationships.
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearHistory}
              icon={<Trash2 size={12} />}
            >
              Clear Log
            </Button>
          )}

          <button
            onClick={() => setShowContextPane(!showContextPane)}
            style={{
              background: 'none',
              border: `1px solid ${colors.border.default}`,
              borderRadius: radius.md,
              color: colors.text.secondary,
              padding: '5px 8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '11px',
            }}
            title={showContextPane ? 'Hide context panel' : 'Show context panel'}
          >
            {showContextPane ? <PanelRightClose size={13} /> : <PanelRightOpen size={13} />}
            <span>Context</span>
          </button>
        </div>
      </div>

      {/* ── 2. Workspace Layout: Conversation + Context / Sources ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', width: '100%', height: '100%' }}>
        {/* Left/Center: Conversation Area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Scrollable Messages Feed */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {error && (
              <div style={{ maxWidth: '780px', margin: '0 auto 12px', width: '100%' }}>
                <ErrorCard
                  title="Assistant Unavailable"
                  whatHappened={error}
                  why="The AI inference provider or analysis server returned an error while processing your request."
                  whatCanIDo={[
                    'Verify provider settings and model availability in Settings.',
                    'Check that your local Ollama instance or cloud API is responding.',
                    'Retry your prompt.',
                  ]}
                  onRetry={() => {
                    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
                    if (lastUserMsg) sendMessage(lastUserMsg.content);
                  }}
                  retrying={loading}
                />
              </div>
            )}

            {!repoPath ? (
              <div style={{ padding: '80px 0', textAlign: 'center', color: colors.text.muted, fontSize: '13px' }}>
                Open or scan a repository to start asking questions grounded in code.
              </div>
            ) : messages.length === 0 ? (
              /* Starter Questions Experience */
              <div
                style={{
                  maxWidth: '680px',
                  margin: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '20px',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: radius.lg,
                    backgroundColor: colors.bg.surfaceSecondary,
                    border: `1px solid ${colors.border.default}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: colors.accent.blue,
                    margin: '0 auto',
                  }}
                >
                  <Sparkles size={22} />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <h2 style={{ fontSize: font.size.base, fontWeight: 600, color: colors.text.primary, margin: 0 }}>
                    Repository Assistant
                  </h2>
                  <p style={{ fontSize: '12px', color: colors.text.secondary, margin: 0, lineHeight: 1.5 }}>
                    Ask questions about architecture, control flow, or specific functions. Answers are verified against the repository's AST symbols and dependency map.
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', textAlign: 'left' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: colors.text.muted }}>
                    Starter Questions
                  </span>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    {starterQuestions.map((q) => (
                      <button
                        key={q}
                        onClick={() => handleSuggestionClick(q)}
                        disabled={loading}
                        style={{
                          textAlign: 'left',
                          padding: '10px 14px',
                          borderRadius: radius.md,
                          backgroundColor: colors.bg.surface,
                          border: `1px solid ${colors.border.default}`,
                          color: colors.text.primary,
                          fontSize: '12px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '6px',
                          transition: 'border-color 0.12s ease',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = colors.accent.blue;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = colors.border.default;
                        }}
                      >
                        <span>{q}</span>
                        <ChevronRight size={13} style={{ color: colors.text.muted, flexShrink: 0 }} />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ maxWidth: '820px', width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {messages.map((msg) => (
                  <ChatMessage
                    key={msg.id}
                    message={msg}
                    onOpenSource={handleOpenSource}
                    onRunAction={handleRunAction}
                  />
                ))}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Console */}
          <div
            style={{
              padding: '14px 24px',
              borderTop: `1px solid ${colors.border.default}`,
              backgroundColor: colors.bg.surface,
            }}
          >
            <div style={{ maxWidth: '820px', margin: '0 auto' }}>
              <ChatInput
                onSendMessage={handleSend}
                disabled={!repoPath || loading}
                placeholder={
                  !repoPath
                    ? 'Select a repository to start assistant session...'
                    : 'Ask about components, data flow, functions, or architecture...'
                }
              />
            </div>
          </div>
        </div>

        {/* ── Right Pane: Context & Sources Panel ── */}
        {showContextPane && (
          <aside
            style={{
              width: '280px',
              minWidth: '280px',
              height: '100%',
              backgroundColor: colors.bg.surface,
              borderLeft: `1px solid ${colors.border.default}`,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              flexShrink: 0,
            }}
          >
            {/* Context Header */}
            <div
              style={{
                padding: '10px 14px',
                borderBottom: `1px solid ${colors.border.default}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                height: '42px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Database size={13} style={{ color: colors.accent.blue }} />
                <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: colors.text.muted }}>
                  Context Used
                </span>
              </div>
              <Tooltip content="Live context gathered from AST extraction, semantic similarity search, and dependency graph topology.">
                <span style={{ cursor: 'help' }}>
                  <Info size={12} style={{ color: colors.text.muted }} />
                </span>
              </Tooltip>
            </div>

            {/* Context Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Repository Grounding Status */}
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: colors.status.success }} />
                  <span style={{ fontSize: '11px', fontWeight: 600, color: colors.text.primary }}>
                    Repository Grounded
                  </span>
                </div>
                <span style={{ fontSize: '11px', color: colors.text.muted }}>
                  {repositoryInfo?.total_files || files.length} files • {repositoryInfo?.total_lines || 0} lines indexed
                </span>
              </div>

              {/* Files Used */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Files Used ({contextUsed.files.length})
                </span>
                {contextUsed.files.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {contextUsed.files.map((f, idx) => (
                      <div
                        key={idx}
                        onClick={() => handleOpenSource(f)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '4px 8px',
                          borderRadius: radius.sm,
                          backgroundColor: colors.bg.surfaceSecondary,
                          border: `1px solid ${colors.border.subtle}`,
                          cursor: 'pointer',
                        }}
                      >
                        <FileCode size={12} style={{ color: colors.accent.blue, flexShrink: 0 }} />
                        <span style={{ fontSize: '11px', fontFamily: font.mono, color: colors.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {getRelativePath(f, repoPath)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span style={{ fontSize: '11px', color: colors.text.muted, fontStyle: 'italic' }}>
                    No specific files queried yet. Ask a question to load sources.
                  </span>
                )}
              </div>

              {/* Symbols Used */}
              {contextUsed.symbols.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Symbols Used ({contextUsed.symbols.length})
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {contextUsed.symbols.map((sym, idx) => (
                      <span
                        key={idx}
                        style={{
                          fontSize: '10px',
                          fontFamily: font.mono,
                          padding: '2px 6px',
                          borderRadius: radius.sm,
                          backgroundColor: colors.bg.surfaceSecondary,
                          border: `1px solid ${colors.border.subtle}`,
                          color: colors.text.primary,
                        }}
                      >
                        {sym}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Graph Relationships Used */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Graph Relationships
                </span>
                <span style={{ fontSize: '11px', color: colors.text.muted }}>
                  {contextUsed.relationshipsCount > 0
                    ? `${contextUsed.relationshipsCount} topological dependency edges analyzed`
                    : 'Call hierarchy and import graph available for exploration.'}
                </span>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};
