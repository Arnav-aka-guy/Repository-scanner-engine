import React, { useMemo } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { User, Sparkles, FileCode, ExternalLink, ArrowRight, CheckCircle2 } from 'lucide-react';
import { ChatMessage as ChatMessageType, SearchResult } from '../types/chat';
import { colors, radius, font } from '../design-system/tokens';
import { Badge, Button, FilePath } from '../design-system/primitives';

interface ChatMessageProps {
  message: ChatMessageType;
  onOpenSource?: (path: string) => void;
  onRunAction?: (actionText: string) => void;
}

/** Formats relative path from repository root */
function getRelativePath(fullPath: string): string {
  const norm = fullPath.replace(/\\/g, '/');
  const parts = norm.split('/');
  return parts.slice(-3).join('/');
}

export const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  onOpenSource,
  onRunAction,
}) => {
  const isUser = message.role === 'user';
  const isEmptyAssistant = !isUser && !message.content;

  // Extract structured sources from message or text pattern fallback
  const sources = useMemo(() => {
    if (message.sources && message.sources.length > 0) {
      return message.sources.map((s) => s.file_path);
    }
    // Pattern match file paths in text (e.g. src/app/page.tsx, backend/security/auth.py)
    const matches = message.content.match(/\b([a-zA-Z0-9_\-./]+\.(?:ts|tsx|js|jsx|py|json|md|html))\b/g);
    if (matches) {
      return Array.from(new Set(matches)).slice(0, 4);
    }
    return [];
  }, [message]);

  // Suggested actions extracted or provided
  const suggestedActions = useMemo(() => {
    if (isUser) return [];
    const text = message.content.toLowerCase();
    const actions: string[] = [];
    if (text.includes('auth') || text.includes('token') || text.includes('security')) {
      actions.push('Inspect security layer');
    }
    if (text.includes('component') || text.includes('view') || text.includes('ui')) {
      actions.push('Open in Repository Explorer');
    }
    if (text.includes('graph') || text.includes('depend') || text.includes('import')) {
      actions.push('View in Dependency Graph');
    }
    return actions.slice(0, 2);
  }, [message, isUser]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: isUser ? 'row-reverse' : 'row',
        gap: '12px',
        width: '100%',
        alignItems: 'flex-start',
      }}
    >
      {/* Avatar */}
      <div
        style={{
          width: '28px',
          height: '28px',
          borderRadius: radius.md,
          backgroundColor: isUser ? colors.accent.blue : colors.bg.surfaceSecondary,
          border: `1px solid ${isUser ? colors.accent.blue : colors.border.default}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: isUser ? '#fff' : colors.accent.blue,
          flexShrink: 0,
          marginTop: '2px',
        }}
      >
        {isUser ? <User size={14} /> : <Sparkles size={14} />}
      </div>

      {/* Message Body */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          maxWidth: isUser ? '75%' : '85%',
          minWidth: '220px',
        }}
      >
        {/* Name & Timestamp Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '11px',
            color: colors.text.muted,
            justifyContent: isUser ? 'flex-end' : 'flex-start',
          }}
        >
          <span style={{ fontWeight: 600, color: isUser ? colors.text.primary : colors.accent.blue }}>
            {isUser ? 'You' : 'Repository Assistant'}
          </span>
          <span>•</span>
          <span>{message.timestamp}</span>
        </div>

        {/* Content Box */}
        <div
          style={{
            padding: '12px 16px',
            borderRadius: radius.lg,
            backgroundColor: isUser ? colors.bg.surfaceSecondary : colors.bg.surface,
            border: `1px solid ${isUser ? colors.border.strong : colors.border.default}`,
            color: colors.text.primary,
            fontSize: '13px',
            lineHeight: 1.6,
          }}
        >
          {isEmptyAssistant ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: colors.text.muted, fontSize: '12px' }}>
              <Sparkles size={13} className="animate-spin" style={{ color: colors.accent.blue }} />
              <span>Analyzing repository context and drafting response...</span>
            </div>
          ) : isUser ? (
            <p style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontWeight: 500 }}>
              {message.content}
            </p>
          ) : (
            <div className="prose-chat select-text">
              <Markdown remarkPlugins={[remarkGfm]}>{message.content}</Markdown>
            </div>
          )}

          {/* Sources Section */}
          {!isUser && sources.length > 0 && (
            <div
              style={{
                marginTop: '12px',
                paddingTop: '10px',
                borderTop: `1px solid ${colors.border.subtle}`,
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: colors.text.muted,
                }}
              >
                Grounded Sources ({sources.length})
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {sources.map((srcPath, sIdx) => (
                  <button
                    key={sIdx}
                    onClick={() => onOpenSource?.(srcPath)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '2px 7px',
                      borderRadius: radius.sm,
                      backgroundColor: colors.bg.primary,
                      border: `1px solid ${colors.border.default}`,
                      color: colors.accent.blue,
                      fontSize: '11px',
                      fontFamily: font.mono,
                      cursor: 'pointer',
                    }}
                    title="Open file in Repository Explorer"
                  >
                    <FileCode size={11} />
                    <span>{getRelativePath(srcPath)}</span>
                    <ExternalLink size={9} style={{ opacity: 0.7 }} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Suggested Next Actions */}
          {!isUser && suggestedActions.length > 0 && (
            <div
              style={{
                marginTop: '10px',
                paddingTop: '8px',
                borderTop: `1px solid ${colors.border.subtle}`,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                flexWrap: 'wrap',
              }}
            >
              <span style={{ fontSize: '10px', color: colors.text.muted, textTransform: 'uppercase' }}>
                Next steps:
              </span>
              {suggestedActions.map((actText, aIdx) => (
                <button
                  key={aIdx}
                  onClick={() => onRunAction?.(actText)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '2px 8px',
                    borderRadius: radius.sm,
                    backgroundColor: colors.bg.surfaceSecondary,
                    border: `1px solid ${colors.border.subtle}`,
                    color: colors.text.secondary,
                    fontSize: '11px',
                    cursor: 'pointer',
                  }}
                >
                  <span>{actText}</span>
                  <ArrowRight size={10} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
