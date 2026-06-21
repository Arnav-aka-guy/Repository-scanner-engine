import React from 'react';
import { motion } from 'framer-motion';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { User, Sparkles } from 'lucide-react';
import { ChatMessage as ChatMessageType } from '../types/chat';

interface ChatMessageProps {
  message: ChatMessageType;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const isUser = message.role === 'user';
  const isEmptyAssistant = !isUser && !message.content;

  return (
    <motion.div
      className={`w-full flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
      initial={{
        opacity: 0,
        x: isUser ? 24 : -24,
        y: 8,
      }}
      animate={{
        opacity: 1,
        x: 0,
        y: 0,
      }}
      transition={{
        duration: 0.4,
        ease: [0.16, 1, 0.3, 1] as const,
      }}
    >
      {/* Assistant Avatar (left side) */}
      {!isUser && (
        <div
          className="flex-shrink-0 flex items-center justify-center rounded-full"
          style={{
            width: '32px',
            height: '32px',
            background: 'linear-gradient(135deg, rgba(167, 139, 250, 0.2) 0%, rgba(167, 139, 250, 0.08) 100%)',
            border: '1px solid rgba(167, 139, 250, 0.2)',
            color: 'var(--accent-purple)',
            marginTop: '2px',
          }}
        >
          <Sparkles size={15} />
        </div>
      )}

      {/* Message Bubble */}
      <div
        className="flex flex-col gap-1"
        style={{ maxWidth: '78%' }}
      >
        <motion.div
          className="relative px-4 py-3"
          style={{
            backgroundColor: isUser
              ? 'var(--accent-primary)'
              : 'var(--bg-secondary)',
            color: isUser ? '#0a0a12' : 'var(--text-secondary)',
            borderRadius: isUser
              ? '18px 18px 6px 18px'
              : '18px 18px 18px 6px',
            border: isUser ? 'none' : '1px solid var(--border-color)',
          }}
          initial={{ scale: 0.96 }}
          animate={{ scale: 1 }}
          transition={{
            type: 'spring',
            stiffness: 500,
            damping: 30,
            delay: 0.05,
          }}
        >
          {/* Typing indicator for empty assistant */}
          {isEmptyAssistant ? (
            <div className="typing-indicator">
              <div className="dot" />
              <div className="dot" />
              <div className="dot" />
            </div>
          ) : isUser ? (
            /* User: plain text */
            <p
              className="text-sm leading-relaxed whitespace-pre-wrap break-words m-0"
              style={{ fontWeight: 500 }}
            >
              {message.content}
            </p>
          ) : (
            /* Assistant: markdown rendered */
            <div className="prose-chat">
              <Markdown remarkPlugins={[remarkGfm]}>
                {message.content}
              </Markdown>
            </div>
          )}
        </motion.div>

        {/* Timestamp */}
        <span
          className={`text-[10px] select-none ${isUser ? 'text-right' : 'text-left'}`}
          style={{
            color: 'var(--text-muted)',
            paddingLeft: isUser ? 0 : '4px',
            paddingRight: isUser ? '4px' : 0,
          }}
        >
          {message.timestamp}
        </span>
      </div>

      {/* User Avatar (right side) */}
      {isUser && (
        <div
          className="flex-shrink-0 flex items-center justify-center rounded-full"
          style={{
            width: '32px',
            height: '32px',
            background: 'linear-gradient(135deg, rgba(96, 165, 250, 0.2) 0%, rgba(96, 165, 250, 0.08) 100%)',
            border: '1px solid rgba(96, 165, 250, 0.2)',
            color: 'var(--accent-primary)',
            marginTop: '2px',
          }}
        >
          <User size={15} />
        </div>
      )}
    </motion.div>
  );
};
