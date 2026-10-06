import React, { useEffect, useRef, useState } from 'react';
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
    <div
      className="w-full flex flex-col rounded-lg overflow-hidden border"
      style={{
        backgroundColor: 'var(--bg-primary)',
        borderColor: 'var(--border-color)',
      }}
    >
      {/* Header Bar */}
      <div
        className="flex items-center justify-between px-3.5 py-2 border-b select-none"
        style={{
          borderColor: 'var(--border-color)',
          backgroundColor: 'var(--bg-secondary)',
        }}
      >
        {/* Left: file icon + name */}
        <div className="flex items-center gap-2 min-w-0">
          <FileCode size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <span
            className="font-mono text-xs truncate"
            style={{ color: 'var(--text-secondary)' }}
            title={displayFileName}
          >
            {displayFileName}
          </span>
        </div>

        {/* Right: language badge + copy button */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="badge badge-blue">{language}</span>

          <button
            onClick={handleCopy}
            className="btn-ghost flex items-center gap-1.5 !px-2 !py-1 !rounded text-xs"
            title="Copy code"
          >
            {copied ? (
              <>
                <Check size={12} style={{ color: 'var(--accent-green)' }} />
                <span className="text-[11px]" style={{ color: 'var(--accent-green)' }}>
                  Copied
                </span>
              </>
            ) : (
              <>
                <Copy size={12} />
                <span className="text-[11px]">Copy</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Code Area */}
      <div className="flex w-full overflow-x-auto text-xs leading-relaxed max-h-[600px]">
        {/* Line Numbers */}
        <div
          className="select-none text-right px-3 py-3 font-mono border-r flex-shrink-0"
          style={{
            color: 'var(--text-muted)',
            borderColor: 'var(--border-color)',
            backgroundColor: 'var(--bg-secondary)',
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
        <pre className="flex-1 py-3 px-4 m-0 bg-transparent overflow-visible min-w-0">
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
    </div>
  );
};
