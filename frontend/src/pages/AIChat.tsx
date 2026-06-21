import React, { useEffect, useRef } from 'react';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { ChatMessage } from '../components/ChatMessage';
import { ChatInput } from '../components/ChatInput';
import { Sparkles, MessageSquare, AlertTriangle, Trash2, Cpu } from 'lucide-react';

export const AIChat: React.FC = () => {
  const repoPath = useWorkspaceStore((s) => s.activeRepository) || '';
  const messages = useWorkspaceStore((s) => s.chatMessages);
  const loading = useWorkspaceStore((s) => s.chatLoading);
  const error = useWorkspaceStore((s) => s.chatError);
  const sendMessage = useWorkspaceStore((s) => s.sendChatMessage);
  const clearHistory = useWorkspaceStore((s) => s.clearChatHistory);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat box to bottom on messages updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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

  const suggestions = [
    'Explain the high-level architecture layout',
    'Find circular dependencies in the repository',
    'Locate potential dead code structures',
    'Generate an onboarding documentation overview',
  ];

  return (
    <div className="flex-grow flex flex-col overflow-hidden h-full">
      {/* 1. Chat Header */}
      <div
        className="px-6 py-4 border-b flex items-center justify-between select-none"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderColor: 'var(--border-color)',
        }}
      >
        <div className="flex items-center gap-2.5">
          <span className="text-[var(--accent-purple)]"><MessageSquare size={20} /></span>
          <h1 className="text-sm font-bold uppercase tracking-wider text-[var(--text-primary)]">
            AI Codebase Assistant Chat
          </h1>
        </div>

        {messages.length > 0 && (
          <button
            onClick={clearHistory}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs text-red-400 hover:text-red-300 hover:bg-red-950/10 transition-colors"
          >
            <Trash2 size={13} />
            <span>Clear Log</span>
          </button>
        )}
      </div>

      {/* 2. Messages List area */}
      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4 scrollbar-thin">
        {error && (
          <div className="p-3 bg-red-950/20 border border-red-500/30 rounded-lg flex items-center gap-3 text-red-300 text-xs">
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        )}

        {!repoPath ? (
          <div className="flex-grow flex flex-col items-center justify-center gap-2 italic text-sm text-[var(--text-muted)] select-none">
            Please select and scan a repository in the Explorer view to activate the chatbot session.
          </div>
        ) : messages.length === 0 ? (
          /* Suggestion cards for empty logs */
          <div className="flex-grow flex flex-col items-center justify-center p-4 max-w-lg mx-auto gap-6 select-none">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg"
              style={{
                backgroundColor: 'rgba(203, 166, 247, 0.08)',
                color: 'var(--accent-purple)',
                border: '1px solid rgba(203, 166, 247, 0.2)',
              }}
            >
              <Cpu size={28} />
            </div>

            <div className="text-center flex flex-col gap-2">
              <h2 className="text-base font-bold text-[var(--text-primary)]">
                Ask Questions about your Code
              </h2>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed px-4">
                I can explain algorithms, discover circular paths, generate code structures, and retrieve RAG references. Select a suggestion or write your own query below:
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full mt-2">
              {suggestions.map((sug) => (
                <button
                  key={sug}
                  onClick={() => handleSuggestionClick(sug)}
                  disabled={loading}
                  className="p-3.5 text-left text-xs rounded-xl border font-sans font-semibold transition-all hover:-translate-y-0.5"
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    borderColor: 'var(--border-color)',
                    color: 'var(--text-secondary)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--accent-purple)';
                    e.currentTarget.style.color = 'var(--text-primary)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-color)';
                    e.currentTarget.style.color = 'var(--text-secondary)';
                  }}
                >
                  {sug}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-4xl w-full mx-auto flex flex-col gap-4">
            {messages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} />
            ))}
          </div>
        )}

        {/* Scroll endpoint */}
        <div ref={messagesEndRef} />
      </div>

      {/* 3. Input form area */}
      <div className="p-6 border-t" style={{ borderColor: 'var(--border-color)' }}>
        <div className="max-w-4xl w-full mx-auto">
          <ChatInput
            onSendMessage={handleSend}
            disabled={loading || !repoPath}
            placeholder={
              !repoPath
                ? 'Explorer scan is required to query the AI assistant ...'
                : 'Ask a question about the repository (e.g. explain the code structures, find circular dependencies) ...'
            }
          />
        </div>
      </div>
    </div>
  );
};
