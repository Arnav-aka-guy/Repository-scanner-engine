import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Send } from 'lucide-react';

interface ChatInputProps {
  onSendMessage: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  disabled = false,
  placeholder = 'Ask a question about the repository...',
}) => {
  const [text, setText] = useState<string>('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canSend = text.trim().length > 0 && !disabled;

  // Auto-resize textarea
  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [text, adjustHeight]);

  const handleSend = () => {
    if (canSend) {
      onSendMessage(text.trim());
      setText('');
      // Reset textarea height after clearing
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
        }
      }, 0);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      className="glass-panel-subtle w-full relative"
      style={{
        opacity: disabled ? 0.6 : 1,
        transition: 'opacity 0.2s',
      }}
    >
      <div className="flex items-end gap-2 p-3">
        {/* Auto-growing Textarea */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none bg-transparent py-2.5 px-3 text-sm font-sans"
          style={{
            color: 'var(--text-primary)',
            outline: 'none',
            maxHeight: '120px',
            lineHeight: '1.5',
            overflowY: text.split('\n').length > 3 ? 'auto' : 'hidden',
          }}
        />

        {/* Send Button */}
        <motion.button
          onClick={handleSend}
          disabled={!canSend}
          className="flex-shrink-0 flex items-center justify-center rounded-xl p-2.5"
          style={{
            backgroundColor: canSend ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
            color: canSend ? 'var(--bg-primary)' : 'var(--text-muted)',
            cursor: canSend ? 'pointer' : 'default',
            border: 'none',
            transition: 'background-color 0.2s, color 0.2s',
          }}
          whileHover={canSend ? { scale: 1.08 } : {}}
          whileTap={canSend ? { scale: 0.92 } : {}}
          animate={
            canSend
              ? {
                  boxShadow: [
                    '0 0 0px rgba(96, 165, 250, 0.2)',
                    '0 0 12px rgba(96, 165, 250, 0.35)',
                    '0 0 0px rgba(96, 165, 250, 0.2)',
                  ],
                }
              : { boxShadow: '0 0 0px rgba(0,0,0,0)' }
          }
          transition={
            canSend
              ? {
                  boxShadow: { duration: 2, repeat: Infinity, ease: 'easeInOut' },
                  scale: { type: 'spring', stiffness: 500, damping: 25 },
                }
              : { duration: 0.2 }
          }
        >
          <Send size={16} />
        </motion.button>
      </div>

      {/* Character count */}
      <div
        className="flex justify-end px-4 pb-2"
        style={{ marginTop: '-4px' }}
      >
        <span
          className="text-[10px] font-mono select-none"
          style={{
            color: text.length > 1000
              ? 'var(--accent-rose)'
              : 'var(--text-muted)',
            opacity: text.length > 0 ? 1 : 0,
            transition: 'opacity 0.2s, color 0.2s',
          }}
        >
          {text.length}
        </span>
      </div>
    </div>
  );
};
