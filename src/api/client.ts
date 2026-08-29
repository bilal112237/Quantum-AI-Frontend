const USER_ID_KEY = 'quantum-ai-user-id';
const TOKEN_KEY = 'quantum-ai-token';
const QUANTUM_CHAT_TOKEN_KEY = 'qc_token';

export const API_BASE = import.meta.env.VITE_API_BASE ?? '/api/v1';


export function getUserId(): string {
  let id = localStorage.getItem(USER_ID_KEY);
  if (!id) {
    id = `user-${crypto.randomUUID().slice(0, 8)}`;
    localStorage.setItem(USER_ID_KEY, id);
  }
  return id;
}

export function setUserId(id: string) {
  localStorage.setItem(USER_ID_KEY, id.trim());
}

export function getToken(): string | null {
  // Prefer QuantumAI session token. Do not silently use a QuantumChat token —
  // mismatched JWT secrets cause opaque 401s on production.
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token.trim());
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(QUANTUM_CHAT_TOKEN_KEY);
}

export function clearSession() {
  clearToken();
  localStorage.removeItem(USER_ID_KEY);
}

/** Notify LoginGate that the JWT is no longer accepted. */
export function notifyAuthExpired() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('quantum-ai-auth-expired'));
}

function authHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    'X-User-Id': getUserId(),
  };
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function parseJson<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({} as Record<string, unknown>));
  if (res.status === 401) {
    clearSession();
    notifyAuthExpired();
    throw new Error(
      (typeof body.error === 'string' && body.error) ||
        (typeof body.message === 'string' && body.message) ||
        'Session expired. Please sign in again.'
    );
  }
  if (!res.ok) {
    throw new Error(
      (typeof body.error === 'string' && body.error) ||
        (typeof body.message === 'string' && body.message) ||
        `Request failed (${res.status})`
    );
  }
  return body as T;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
  return parseJson<T>(res);
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return parseJson<T>(res);
}

export type AiAuthUser = {
  id: string;
  email: string;
  displayName: string;
};

export async function registerAiAccount(input: {
  email: string;
  password: string;
  displayName?: string;
}) {
  const result = await apiPost<{
    success: boolean;
    data?: { token: string; user: AiAuthUser };
    error?: string;
  }>('/auth/register', input);
  return result.data!;
}

export async function loginAiAccount(input: { email: string; password: string }) {
  const result = await apiPost<{
    success: boolean;
    data?: { token: string; user: AiAuthUser };
    error?: string;
  }>('/auth/login', input);
  return result.data!;
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parseJson<T>(res);
}

export async function apiDelete<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  return parseJson<T>(res);
}

export async function uploadDocuments(files: FileList | File[]) {
  const form = new FormData();
  const list = Array.from(files);
  list.forEach((f) => form.append('files', f));

  const res = await fetch(`${API_BASE}/documents/upload`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  });
  return parseJson<{
    success: boolean;
    data: { documents: Array<{ id: string; originalName: string }> };
  }>(res);
}

export interface StreamChatOptions {
  message: string;
  conversationId?: string;
  documentIds?: string[];
  model?: string;
  webSearch?: boolean;
  searchSources?: Array<'google' | 'youtube' | 'reddit'>;
  onStart?: (conversationId: string, searchResults?: import('../types').SearchResultsPayload) => void;
  onChunk: (text: string) => void;
  onDone?: (payload: { conversationId: string; content: string }) => void;
  onError?: (message: string) => void;
  signal?: AbortSignal;
}

export async function streamChat(options: StreamChatOptions) {
  const res = await fetch(`${API_BASE}/ai/chat`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: options.message,
      conversationId: options.conversationId,
      documentIds: options.documentIds,
      model: options.model,
      webSearch: options.webSearch ?? false,
      searchSources: options.searchSources,
      stream: true,
    }),
    signal: options.signal,
  });

  if (!res.ok) {
    if (res.status === 401) {
      clearSession();
      notifyAuthExpired();
    }
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Chat failed (${res.status})`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response stream');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';

    for (const part of parts) {
      if (!part.trim()) continue;

      let event = 'message';
      let data = '';
      for (const line of part.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      if (!data) continue;

      try {
        const payload = JSON.parse(data) as Record<string, unknown>;
        if (event === 'start' && typeof payload.conversationId === 'string') {
          const searchResults = payload.searchResults as import('../types').SearchResultsPayload | undefined;
          options.onStart?.(payload.conversationId, searchResults);
        } else if (event === 'chunk' && typeof payload.content === 'string') {
          options.onChunk(payload.content);
        } else if (event === 'done') {
          options.onDone?.({
            conversationId: String(payload.conversationId ?? ''),
            content: String(payload.content ?? ''),
          });
        } else if (event === 'error') {
          options.onError?.(String(payload.message ?? 'Stream error'));
        }
      } catch {
        // ignore malformed chunks
      }
    }
  }
}

export async function searchWeb(
  query: string,
  sources?: Array<'google' | 'youtube' | 'reddit'>
) {
  const result = await apiPost<{
    success: boolean;
    data: import('../types').SearchResultsPayload;
  }>('/search', { query, sources });
  return result.data;
}

export async function listModels() {
  const result = await apiGet<{ success: boolean; data: { models: string[] } }>('/ai/models');
  return result.data?.models ?? [];
}

export async function downloadPresentation(
  id: string,
  body?: { subject?: string; gradeLevel?: string }
) {
  const res = await fetch(`${API_BASE}/presentations/${id}/download`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    if (res.status === 401) {
      clearSession();
      notifyAuthExpired();
    }
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? 'Presentation generation failed');
  }
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition');
  const match = disposition?.match(/filename="(.+)"/);
  const filename = match?.[1] ?? 'presentation.pptx';
  return { blob, filename };
}

export async function downloadConversationExport(id: string, title: string) {
  const res = await fetch(`${API_BASE}/conversations/${id}/export`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Export failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(title || 'conversation').replace(/[^a-z0-9]+/gi, '-')}.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function downloadDocumentConversion(id: string, format: 'txt' | 'markdown') {
  const res = await fetch(`${API_BASE}/documents/${id}/download/${format}`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    if (res.status === 401) {
      clearSession();
      notifyAuthExpired();
    }
    throw new Error('Document conversion failed');
  }
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition');
  const filename =
    disposition?.match(/filename="(.+)"/)?.[1] ?? `document.${format === 'markdown' ? 'md' : 'txt'}`;
  return { blob, filename };
}
