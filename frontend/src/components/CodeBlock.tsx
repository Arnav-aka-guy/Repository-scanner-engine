import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.css';
import { Copy, Check, FileCode } from 'lucide-react';

interface CodeBlockProps {
  code: string;
  language: string;
  fileName?: string;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({
  code,
  language,
  fileName,
}) => {
  const codeRef = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    if (codeRef.current) {
      codeRef.current.removeAttribute('data-highlighted');
      hljs.highlightElement(codeRef.current);
    }
  }, [code, language]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const lines = code ? code.split('\n') : [];
  const lineNumberWidth = String(lines.length).length;

  const displayFileName =
    fileName || `snippet.${language === 'python' ? 'py' : language === 'typescript' ? 'ts' : language === 'javascript' ? 'js' : language}`;

  return (
    <motion.div
      className="w-full flex flex-col rounded-xl overflow-hidden border"
      style={{
        backgroundColor: 'var(--bg-primary)',
        borderColor: 'var(--border-color)',
      }}
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] as const }}
    >
      {/* Header Bar */}
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b"
        style={{
          borderColor: 'var(--border-color)',
          background:
            'linear-gradient(135deg, rgba(15, 15, 26, 0.9) 0%, rgba(26, 26, 46, 0.6) 100%)',
        }}
      >
        {/* Left: file icon + name */}
        <div className="flex items-center gap-2">
          <FileCode size={14} style={{ color: 'var(--text-muted)' }} />
          <span
            className="font-mono text-xs truncate"
            style={{ color: 'var(--text-secondary)' }}
          >
            {displayFileName}
          </span>
        </div>

        {/* Right: language badge + copy button */}
        <div className="flex items-center gap-2">
          <span className="badge badge-blue">{language}</span>

          <motion.button
            onClick={handleCopy}
            className="btn-ghost flex items-center gap-1.5 !px-2 !py-1 !rounded-lg"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 500, damping: 25 }}
          >
            {copied ? (
              <>
                <Check size={13} style={{ color: 'var(--accent-green)' }} />
                <span className="text-[11px]" style={{ color: 'var(--accent-green)' }}>
                  Copied!
                </span>
              </>
            ) : (
              <>
                <Copy size={13} />
                <span className="text-[11px]">Copy</span>
              </>
            )}
          </motion.button>
        </div>
      </div>

      {/* Code Area */}
      <div className="flex w-full overflow-x-auto text-xs leading-relaxed max-h-[600px]">
        {/* Line Numbers */}
        <div
          className="select-none text-right px-3 py-4 font-mono border-r flex-shrink-0"
          style={{
            color: 'var(--text-muted)',
            borderColor: 'var(--border-color)',
            backgroundColor: 'rgba(10, 10, 18, 0.5)',
            minWidth: `${lineNumberWidth * 8 + 24}px`,
          }}
        >
          {lines.map((_, idx) => (
            <div
              key={idx}
              style={{
                height: '19px',
                lineHeight: '19px',
              }}
            >
              {idx + 1}
            </div>
          ))}
        </div>

        {/* Code Content */}
        <pre className="flex-1 py-4 px-4 m-0 bg-transparent overflow-visible min-w-0">
          <code
            ref={codeRef}
            className={`language-${language} block font-mono h-full bg-transparent`}
            style={{
              padding: 0,
              background: 'transparent',
              outline: 'none',
            }}
          >
            {code}
          </code>
        </pre>
      </div>
    </motion.div>
  );
};
