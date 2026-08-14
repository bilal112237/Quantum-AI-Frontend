import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MessageBubble } from './components/MessageBubble';
import { ChatInput } from './components/ChatInput';
import { SearchResultsCard } from './components/SearchResultsCard';
import { ThemeMenu } from './components/ThemeMenu';
import { ConversationActionsMenu } from './components/ConversationActionsMenu';
import {
  deleteConversation,
  deleteDocument,
  deleteLastMessages,
  fetchConversation,
  fetchConversationsPage,
  fetchDocuments,
  truncateFromMessage,
  updateConversation,
} from './api/conversations';
import {
  streamChat,
  uploadDocuments,
  listModels,
} from './api/client';
import { useAuthSession } from './components/LoginGate';
import type { ChatMessage, Conversation, DocumentItem } from './types';
import { filterChatModels, pickDefaultChatModel } from './utils/chatModels';



const LOGO_SRC = '/logo.png';

const SUGGESTIONS = [
  'Explain quantum computing in simple terms',
  'Write a README.md for my project',
  'Summarize my uploaded document',
  'Make a quiz from my notes',
];

type SidebarTab = 'chats' | 'documents';
type ChatFilter = 'all' | 'archived';



export default function App() {
  const { logout } = useAuthSession();
  const [tab, setTab] = useState<SidebarTab>('chats');
  const [chatFilter, setChatFilter] = useState<ChatFilter>('all');
  const [search, setSearch] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [attachedDocs, setAttachedDocs] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [conversationCursor, setConversationCursor] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState('llama-3.3-70b-versatile');
  const [webSearch, setWebSearch] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const [lastPresentationMsg, setLastPresentationMsg] = useState<ChatMessage | null>(null);
  

  const activeConversation = conversations.find((c) => c._id === activeConversationId);
  const activeTitle = activeConversation?.title ?? 'New conversation';

  const loadConversations = useCallback(async (q?: string, filter: ChatFilter = chatFilter) => {
    try {
      const page = await fetchConversationsPage({
        q: q?.trim() || undefined,
        archived: filter === 'archived' ? true : false,
        limit: 50,
      });
      setConversations(page.conversations);
      setConversationCursor(page.nextCursor);
      setOnline(true);
    } catch {
      setOnline(false);
    }
  }, [chatFilter]);

  const loadMoreConversations = async () => {
    if (!conversationCursor) return;
    const page = await fetchConversationsPage({
      q: search.trim() || undefined,
      archived: chatFilter === 'archived',
      limit: 50,
      cursor: conversationCursor,
    });
    setConversations((current) => [
      ...current,
      ...page.conversations.filter((next) => !current.some((item) => item._id === next._id)),
    ]);
    setConversationCursor(page.nextCursor);
  };

  const loadDocuments = useCallback(async () => {
    try {
      const list = await fetchDocuments();
      setDocuments(list);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadConversations(search, chatFilter);
    loadDocuments();
  }, [loadConversations, loadDocuments, search, chatFilter]);

  useEffect(() => {
    listModels()
      .then((available) => {
        const chatModels = filterChatModels(available);
        const next = chatModels.length
          ? chatModels
          : [pickDefaultChatModel([])];
        setSelectedModel((current) =>
          next.includes(current) ? current : pickDefaultChatModel(next),
        );
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    const onScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      shouldAutoScrollRef.current = distanceFromBottom < 100;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const el = threadRef.current;
    if (!el || !shouldAutoScrollRef.current) return;
    el.scrollTo({ top: el.scrollHeight, behavior: loading ? 'auto' : 'smooth' });
  }, [messages, loading]);

  const openConversation = async (id: string) => {
    setActiveConversationId(id);
    setError(null);
    try {
      const { messages: history } = await fetchConversation(id);
      setMessages(history);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load conversation');
    }
  };

  const startNewChat = () => {
    abortRef.current?.abort();
    setActiveConversationId(null);
    setMessages([]);
    setInput('');
    setAttachedDocs([]);
    setError(null);
    setSidebarOpen(false);
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setLoading(false);
  };

  const runStream = async (message: string, conversationId?: string | null) => {
    setError(null);
    setLoading(true);

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: message,
    };
    const assistantId = `a-${Date.now()}`;
    setMessages((prev) => [...prev, userMsg, { id: assistantId, role: 'assistant', content: '' }]);

    abortRef.current = new AbortController();

    let finalContent = '';
    const isPresentationModification =
      Boolean(lastPresentationMsg) && message.toLowerCase().includes('slide');
    const finalMessage =
      isPresentationModification && lastPresentationMsg
        ? `Regarding this presentation draft:\n\n${lastPresentationMsg.content}\n\nUser request: ${message}`
        : message;

    try {
      let convId = conversationId ?? undefined;

      await streamChat({
        message: finalMessage,
        conversationId: convId,
        documentIds: attachedDocs.map((d) => d._id),
        model: selectedModel || undefined,
        webSearch,
        signal: abortRef.current.signal,
        onStart: (id, searchResults) => {
          convId = id;
          if (!activeConversationId) setActiveConversationId(id);
          if (searchResults) {
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, searchResults } : m))
            );
          }
        },
        onChunk: (chunk) => {
          finalContent += chunk;
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + chunk } : m))
          );
        },
        onError: (msg) => setError(msg),
      });

      await loadConversations(search, chatFilter);
      if (convId) {
        const { messages: history } = await fetchConversation(convId);
        setMessages((prev) => {
          const withSearch = prev.find((m) => m.id === assistantId)?.searchResults;
          if (!withSearch) return history;
          return history.map((m, index) =>
            index === history.length - 1 && m.role === 'assistant'
              ? { ...m, searchResults: withSearch }
              : m
          );
        });
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setError(e instanceof Error ? e.message : 'Failed to send message');
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
      } else {
        setMessages((prev) => prev.filter((m) => !(m.id === assistantId && !m.content)));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async (text?: string) => {
    const message = (text ?? input).trim();
    if (!message || loading) return;
    setInput('');
    await runStream(message, activeConversationId);
  };

  const handleRegenerate = async () => {
    if (!activeConversationId || loading) return;
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUser) return;
    try {
      // Remove last assistant (+ last user) so stream can re-append both
      const trailing = [...messages].reverse();
      let count = 0;
      if (trailing[0]?.role === 'assistant') count += 1;
      if (trailing[count]?.role === 'user') count += 1;
      if (count > 0) await deleteLastMessages(activeConversationId, count);
      setMessages((prev) => prev.slice(0, Math.max(0, prev.length - count)));
      await runStream(lastUser.content, activeConversationId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Regenerate failed');
    }
  };

  const handleRetry = () => handleRegenerate();

  const handleEditPrompt = async (message: ChatMessage) => {
    if (!activeConversationId || loading) return;
    try {
      await truncateFromMessage(activeConversationId, message.id);
      const { messages: history } = await fetchConversation(activeConversationId);
      setMessages(history);
      setInput(message.content);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Edit failed');
    }
  };

  const handleUpload = async (files: FileList | File[]) => {
    setError(null);
    try {
      const res = await uploadDocuments(files);
      const uploadedIds = new Set(res.data.documents.map((d) => d.id));
      const all = await fetchDocuments();
      setDocuments(all);
      const newDocs = all.filter((d) => uploadedIds.has(d._id));
      setAttachedDocs((prev) => [...prev, ...newDocs.filter((n) => !prev.some((p) => p._id === n._id))]);
      setTab('chats');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    }
  };

  const handleDeleteConversation = async (id: string) => {
    await deleteConversation(id);
    if (activeConversationId === id) startNewChat();
    await loadConversations(search, chatFilter);
  };

  const handleDeleteDocument = async (id: string) => {
    try {
      await deleteDocument(id);
      setDocuments((prev) => prev.filter((d) => d._id !== id));
      setAttachedDocs((prev) => prev.filter((d) => d._id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete document');
    }
  };

  const handleDownloadPresentation = async (message: ChatMessage, format?: string) => {
    if (!message.content) return;

    const text = message.content;
    const sdkFormat =
      format === 'word' ? 'docx'
        : format === 'markdown' ? 'md'
        : format === 'text' ? 'txt'
        : 'pdf';

    const sourceFormat = format === 'text' ? 'txt' : 'md';
    const fileName = sourceFormat === 'md' ? 'answer.md' : 'answer.txt';
    const mimeType = sourceFormat === 'md' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8';

    const inputFile = new File([text], fileName, { type: mimeType });

    try {
      console.log('Loading FormatConvert SDK...');
      const { convert } = await import('https://formatconvert.quantumlogicslimited.com/sdk.js');

      const { blob } = await convert(inputFile, sdkFormat, {
        from: sourceFormat,
        onProgress: ({ page, total, stage }) => {
          console.log('convert progress', page, total, stage);
        },
      });

    const ext =
      format === 'word' ? 'docx'
        : format === 'markdown' ? 'md'
        : format === 'text' ? 'txt'
        : 'pdf';

    const downloadName = `answer.${ext}`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = downloadName;
    a.click();
    URL.revokeObjectURL(url);
    } catch (err) {
      console.error('FormatConvert failed', err);

      const fallbackName =
        format === 'word' ? 'answer.docx'
          : format === 'markdown' ? 'answer.md'
          : format === 'text' ? 'answer.txt'
          : 'answer.pdf';

      const fallbackBlob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const fallbackUrl = URL.createObjectURL(fallbackBlob);
      const a = document.createElement('a');
      a.href = fallbackUrl;
      a.download = fallbackName;
      a.click();
      URL.revokeObjectURL(fallbackUrl);
    }
  };

  const handleRequestPresentationChanges = (message: ChatMessage) => {
    setLastPresentationMsg(message);
    setInput('Please update slide ');
  };

  const handleRename = async (id: string) => {
    const title = renameValue.trim();
    if (!title) {
      setRenamingId(null);
      return;
    }
    try {
      await updateConversation(id, { title });
      setRenamingId(null);
      await loadConversations(search, chatFilter);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rename failed');
    }
  };

  const handlePin = async (conv: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    await updateConversation(conv._id, { pinned: !conv.pinned });
    await loadConversations(search, chatFilter);
  };

  const handleArchive = async (conv: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    await updateConversation(conv._id, { archived: !conv.archived });
    if (activeConversationId === conv._id && !conv.archived) startNewChat();
    await loadConversations(search, chatFilter);
  };

  const toggleDocumentInChat = (doc: DocumentItem) => {
    setAttachedDocs((prev) =>
      prev.some((d) => d._id === doc._id) ? prev.filter((d) => d._id !== doc._id) : [...prev, doc]
    );
  };

  const lastUserIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === 'user') return i;
    }
    return -1;
  }, [messages]);

  const lastAssistantIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === 'assistant') return i;
    }
    return -1;
  }, [messages]);

  return (
    <div className="app-shell">
      {sidebarOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close sidebar"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="brand">
            <img src={LOGO_SRC} alt="Quantum AI" className="brand-logo" />
            <div>
              <h1>Quantum AI</h1>
              <p>Powered by Groq</p>
            </div>
          </div>
          <button
            type="button"
            className="mobile-sidebar-close"
            aria-label="Close conversations"
            onClick={() => setSidebarOpen(false)}
          >
            ×
          </button>
        </div>
        <div className="sidebar-actions">
          <button type="button" className="btn btn-primary" onClick={startNewChat}>
            + New chat
          </button>
        </div>

        <div className="sidebar-tabs">
          <button
            type="button"
            className={`tab ${tab === 'chats' ? 'active' : ''}`}
            onClick={() => setTab('chats')}
          >
            Chats
          </button>
          <button
            type="button"
            className={`tab ${tab === 'documents' ? 'active' : ''}`}
            onClick={() => setTab('documents')}
          >
            Documents
          </button>
        </div>

        {tab === 'chats' && (
          <div className="sidebar-search">
            <input
              type="search"
              placeholder="Search chats…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="chat-filter-tabs">
              <button
                type="button"
                className={chatFilter === 'all' ? 'active' : ''}
                onClick={() => setChatFilter('all')}
              >
                Active
              </button>
              <button
                type="button"
                className={chatFilter === 'archived' ? 'active' : ''}
                onClick={() => setChatFilter('archived')}
              >
                Archived
              </button>
            </div>
          </div>
        )}

        <div className="sidebar-list">
          {tab === 'chats' ? (
            conversations.length === 0 ? (
              <p style={{ color: '#64748b', fontSize: '0.8rem', padding: '0.5rem' }}>
                {search ? 'No chats match your search' : 'No conversations yet'}
              </p>
            ) : (
              <>
                {conversations.map((conv) => (
                  <div
                    key={conv._id}
                    className={`list-item ${activeConversationId === conv._id ? 'active' : ''} ${conv.pinned ? 'pinned' : ''}`}
                    onClick={() => {
                      openConversation(conv._id);
                      setSidebarOpen(false);
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && openConversation(conv._id)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="list-item-body">
                      {renamingId === conv._id ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleRename(conv._id);
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            className="rename-input"
                            value={renameValue}
                            autoFocus
                            onChange={(e) => setRenameValue(e.target.value)}
                            onBlur={() => handleRename(conv._id)}
                          />
                        </form>
                      ) : (
                        <span className="list-item-title">
                          {conv.pinned ? '📌 ' : ''}
                          {conv.title}
                        </span>
                      )}
                      <span className="list-item-meta">
                        {new Date(conv.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                    <ConversationActionsMenu
                      conversation={conv}
                      onPin={(e) => handlePin(conv, e)}
                      onRename={() => {
                        setRenamingId(conv._id);
                        setRenameValue(conv.title);
                      }}
                      onArchive={(e) => handleArchive(conv, e)}
                      onDelete={() => handleDeleteConversation(conv._id)}
                    />
                  </div>
                ))}
                {conversationCursor && (
                  <button type="button" className="btn btn-ghost load-more" onClick={loadMoreConversations}>
                    Load more conversations
                  </button>
                )}
              </>
            )
          ) : documents.length === 0 ? (
            <p style={{ color: '#64748b', fontSize: '0.8rem', padding: '0.5rem' }}>
              Upload files from chat, then ask for a README, summary, quiz, slides, and more
            </p>
          ) : (
            documents.map((doc) => {
              const inChat = attachedDocs.some((d) => d._id === doc._id);
              return (
              <div
                key={doc._id}
                className={`list-item ${inChat ? 'active' : ''}`}
                role="button"
                tabIndex={0}
                title={inChat ? 'Remove from chat context' : 'Use this document in chat'}
                onClick={() => toggleDocumentInChat(doc)}
                onKeyDown={(e) => e.key === 'Enter' && toggleDocumentInChat(doc)}
              >
                <span className="list-item-title">📄 {doc.originalName}</span>
                <span className="list-item-meta">
                  {(doc.wordCount ?? 0).toLocaleString()} words
                  {doc.pageCount ? ` · ${doc.pageCount} pages` : ''}
                  {inChat ? ' · in chat' : ''}
                  {' · '}
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteDocument(doc._id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.stopPropagation();
                        handleDeleteDocument(doc._id);
                      }
                    }}
                    style={{ color: '#f87171', cursor: 'pointer' }}
                  >
                    Delete
                  </span>
                </span>
              </div>
              );
            })
          )}
        </div>

        <div className="sidebar-footer">
          <p className="sidebar-status">
            {online ? '● API connected' : '○ API offline — start backend on port 5001'}
          </p>
          <button type="button" className="btn btn-logout" onClick={logout}>
            Log out
          </button>
        </div>
      </aside>

      <main className="main-panel">
        <header className="chat-header">
          <button
            type="button"
            className="mobile-menu-btn"
            aria-label="Open conversations"
            onClick={() => setSidebarOpen(true)}
          >
            ☰
          </button>
          <div className="chat-header-brand">
            <img src={LOGO_SRC} alt="Quantum AI" />
            <div>
              <h2>{activeTitle}</h2>
              {(attachedDocs.length > 0 || webSearch || loading) && (
                <p>
                  {attachedDocs.length > 0 && `${attachedDocs.length} document(s) attached`}
                  {webSearch && `${attachedDocs.length > 0 ? ' · ' : ''}live search`}
                  {loading && `${attachedDocs.length > 0 || webSearch ? ' · ' : ''}generating…`}
                </p>
              )}
            </div>
          </div>
          <div className="chat-header-actions">
            <ThemeMenu tone="header" />
          </div>
        </header>

        {error && <div className="error-banner">{error}</div>}

        <div className="chat-thread" ref={threadRef}>
          {messages.length === 0 ? (
            <div className="empty-state">
              <img src="/logo.png" alt="Quantum AI" className="brand-logo-lg" />
              <h3>How can I help you today?</h3>
              <p>
                Upload a document, then ask in plain language — Quantum AI picks the right format
                (Markdown for a README, quiz, summary, slides, and more).
              </p>
              <div className="suggestion-grid">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" className="suggestion" onClick={() => handleSend(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, idx) => (
              <div key={m.id} className="message-with-search">
                {m.role === 'assistant' && m.searchResults && (
                  <SearchResultsCard payload={m.searchResults} />
                )}
                <MessageBubble
                  message={m}
                  streaming={loading && idx === lastAssistantIndex && m.role === 'assistant'}
                  isLastAssistant={idx === lastAssistantIndex && m.role === 'assistant'}
                  isLastUser={idx === lastUserIndex && m.role === 'user'}
                  onRegenerate={
                    idx === lastAssistantIndex && m.role === 'assistant' && !loading
                      ? handleRegenerate
                      : undefined
                  }
                  onRetry={
                    idx === lastAssistantIndex && m.role === 'assistant' && !loading
                      ? handleRetry
                      : undefined
                  }
                  onEdit={
                    idx === lastUserIndex && m.role === 'user' && !loading
                      ? () => handleEditPrompt(m)
                      : undefined
                  }
                  onDownload={m.role === 'assistant' ? handleDownloadPresentation : undefined}
                  onRequestChanges={m.downloadable ? handleRequestPresentationChanges : undefined}
                />
              </div>
            ))
          )}
        </div>

        <ChatInput
          value={input}
          onChange={setInput}
          onSend={() => handleSend()}
          onStop={handleStop}
          disabled={loading}
          loading={loading}
          attachedDocs={attachedDocs}
          onAttach={handleUpload}
          onRemoveDoc={(id) => setAttachedDocs((prev) => prev.filter((d) => d._id !== id))}
          webSearch={webSearch}
          onWebSearchChange={setWebSearch}
        />
      </main>
    </div>
  );
  
}


