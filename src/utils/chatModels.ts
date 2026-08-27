/**
 * Groq exposes every model on the account (chat, STT, TTS, guards).
 * The assistant UI should only offer chat-capable LLMs.
 */

const NON_CHAT_PATTERNS = [
  /whisper/i,
  /transcri/i,
  /speech/i,
  /tts/i,
  /orpheus/i,
  /audio/i,
  /prompt-guard/i,
  /safeguard/i,
  /guard[-_]?2/i,
  /embed/i,
  /rerank/i,
];

/** Preferred order for the chat model picker (first match wins for default). */
export const PREFERRED_CHAT_MODELS = [
  'openai/gpt-oss-120b',
  'qwen/qwen3.6-27b',
  'openai/gpt-oss-20b',
  'llama-3.1-8b-instant',
  'llama-3.3-70b-versatile',
  'groq/compound',
  'groq/compound-mini',
  'allam-2-7b',
] as const;

export function isChatModel(modelId: string): boolean {
  const id = modelId.trim();
  if (!id) return false;
  return !NON_CHAT_PATTERNS.some((pattern) => pattern.test(id));
}

export function filterChatModels(modelIds: string[]): string[] {
  const chat = [...new Set(modelIds.filter(isChatModel))];

  chat.sort((a, b) => {
    const ai = PREFERRED_CHAT_MODELS.indexOf(a as (typeof PREFERRED_CHAT_MODELS)[number]);
    const bi = PREFERRED_CHAT_MODELS.indexOf(b as (typeof PREFERRED_CHAT_MODELS)[number]);
    const aRank = ai === -1 ? Number.MAX_SAFE_INTEGER : ai;
    const bRank = bi === -1 ? Number.MAX_SAFE_INTEGER : bi;
    if (aRank !== bRank) return aRank - bRank;
    return a.localeCompare(b);
  });

  return chat;
}

export function pickDefaultChatModel(available: string[], fallback = 'openai/gpt-oss-120b'): string {
  for (const preferred of PREFERRED_CHAT_MODELS) {
    if (available.includes(preferred)) return preferred;
  }
  return available[0] || fallback;
}
