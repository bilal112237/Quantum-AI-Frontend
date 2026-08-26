import { useState, useRef, useEffect, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import rehypeSanitize from 'rehype-sanitize';
import type { ChatMessage } from '../types';
import { safeMarkdownUrl } from '../utils/safeUrl';

interface Props {
  message: ChatMessage;
  isLastAssistant?: boolean;
  isLastUser?: boolean;
  streaming?: boolean;
  onCopy?: () => void;
  onRegenerate?: () => void;
  onRetry?: () => void;
  onEdit?: (message: ChatMessage) => void;
  onDownload?: (message: ChatMessage, format?: string) => void;
  onRequestChanges?: (message: ChatMessage) => void;
}

const TERMINAL_LANGS = new Set([
  'bash',
  'sh',
  'shell',
  'zsh',
  'powershell',
  'ps1',
  'console',
  'terminal',
  'cmd',
  'dos',
]);

function CodeBlock({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const lang = /language-(\w+)/.exec(className || '')?.[1]?.toLowerCase() ?? '';
  const isTerminal = TERMINAL_LANGS.has(lang);
  const text = String(children ?? '').replace(/\n$/, '');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <div className={`code-block${isTerminal ? ' code-block--terminal' : ''}`}>
      <div className="code-block-header">
        <span>{isTerminal ? 'Terminal' : lang || 'code'}</span>
        <button type="button" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className={className}>
        {isTerminal ? <span className="terminal-prompt" aria-hidden="true">$</span> : null}
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
}

export function MessageBubble({
  message,
  isLastAssistant,
  isLastUser,
  streaming,
  onCopy,
  onRegenerate,
  onRetry,
  onEdit,
  onDownload,
  onRequestChanges,
}: Props) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!menuRef.current) return;
      if (!(e.target instanceof Node)) return;
      if (!menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      onCopy?.();
    } catch {
      // ignore
    }
  };

  const fallbackClientDownload = (format?: string) => {
    const text = message.content ?? '';
    const ext =
      format === 'markdown' ? 'md' :
        format === 'word' ? 'docx' :
          format === 'pdf' ? 'pdf' :
            'txt';
    const mime =
      format === 'markdown' ? 'text/markdown' :
        format === 'text' ? 'text/plain' :
          'application/octet-stream';
    const filename = `answer.${ext}`;
    const blob = new Blob([text], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadClick = (format?: string) => {
    if (onDownload) {
      onDownload(message, format);
    } else {
      fallbackClientDownload(format);
    }
    setMenuOpen(false);
  };

  return (
    <div className={`message-row ${isUser ? 'user' : 'assistant'}`}>
      <div className={`avatar ${isUser ? 'user' : 'assistant'}`}>
        {isUser ? 'You' : <img src="/logo.png" alt="Quantum AI" />}
      </div>
      <div className={`bubble-wrap ${isUser ? 'user' : 'assistant'}`}>
        <div className={`bubble ${isUser ? 'user' : 'assistant'}`}>
          {isUser ? (
            <div style={{ whiteSpace: 'pre-wrap' }}>{message.content}</div>
          ) : message.content ? (
            <ReactMarkdown
              urlTransform={safeMarkdownUrl}
              rehypePlugins={[rehypeSanitize, rehypeHighlight]}
              components={{
                pre: ({ children }) => <>{children}</>,
                code: ({ className, children, ...props }) => {
                  const isBlock = Boolean(className) || String(children).includes('\n');
                  if (!isBlock) {
                    return (
                      <code className="inline-code" {...props}>
                        {children}
                      </code>
                    );
                  }
                  return <CodeBlock className={className}>{children}</CodeBlock>;
                },
                a: ({ href, children, ...props }) => {
                  const safe = safeMarkdownUrl(href || '');
                  if (!safe) {
                    return <span>{children}</span>;
                  }
                  return (
                    <a href={safe} target="_blank" rel="noopener noreferrer" {...props}>
                      {children}
                    </a>
                  );
                },
              }}
            >
              {message.content}
            </ReactMarkdown>
          ) : (
            <div className="typing" aria-label="Assistant is typing">
              <span />
              <span />
              <span />
            </div>
          )}
        </div>

        {message.content && !streaming && (
          <div className="message-actions">
            <button type="button" onClick={handleCopy} title="Copy message">
              {copied ? 'Copied' : 'Copy'}
            </button>
            {isUser && isLastUser && onEdit && (
              <button type="button" onClick={() => onEdit?.(message)} title="Edit prompt">
                Edit
              </button>
            )}
            {!isUser && isLastAssistant && onRegenerate && (
              <button type="button" onClick={onRegenerate} title="Regenerate response">
                Regenerate
              </button>
            )}
            {!isUser && isLastAssistant && onRetry && (
              <button type="button" onClick={onRetry} title="Retry response">
                Retry
              </button>
            )}

            {!isUser && (
              <div className="more-container" ref={menuRef}>
                <button
                  className="more-btn"
                  aria-haspopup="true"
                  aria-expanded={menuOpen}
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen((s) => !s);
                  }}
                  title="More"
                >
                  ⋯
                </button>
                {menuOpen && (
                  <div className="more-menu" role="menu">
                    <button type="button" onClick={() => handleDownloadClick('pdf')}>
                      📥 PDF
                    </button>
                    <button type="button" onClick={() => handleDownloadClick('word')}>
                      📥 Word
                    </button>
                    <button type="button" onClick={() => handleDownloadClick('text')}>
                      📥 Text
                    </button>
                    <button type="button" onClick={() => handleDownloadClick('markdown')}>
                      📥 Markdown
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {message.downloadable && (
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <button
              type="button"
              onClick={() => onDownload?.(message)}
              className="msg-action-btn msg-action-btn--primary"
            >
              ⬇ Download
            </button>
            <button
              type="button"
              onClick={() => onRequestChanges?.(message)}
              className="msg-action-btn msg-action-btn--secondary"
            >
              ✏️ Request Changes
            </button>
          </div>
        )}
      </div>
    </div>
  );
}