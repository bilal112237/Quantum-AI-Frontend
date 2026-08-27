import { useEffect, useRef, useState } from 'react';
import type { DocumentItem } from '../types';
import { CameraCapture } from './CameraCapture';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop?: () => void;
  disabled?: boolean;
  loading?: boolean;
  attachedDocs: DocumentItem[];
  onAttach: (files: FileList | File[]) => void;
  onRemoveDoc: (id: string) => void;
  webSearch?: boolean;
  onWebSearchChange?: (enabled: boolean) => void;
}

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: { transcript: string; confidence?: number };
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike> & { length: number };
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

function resolveSpeechLang(): string {
  const nav = typeof navigator !== 'undefined' ? navigator.language || 'en-US' : 'en-US';
  return nav.trim() || 'en-US';
}

function joinTranscript(base: string, finalPart: string, interimPart: string): string {
  const chunks = [base.trimEnd(), finalPart.trim(), interimPart.trim()].filter(Boolean);
  return chunks.join(' ');
}

export function ChatInput({
  value,
  onChange,
  onSend,
  onStop,
  disabled,
  loading,
  attachedDocs,
  onAttach,
  onRemoveDoc,
  webSearch = false,
  onWebSearchChange,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const valueRef = useRef(value);
  const baseTextRef = useRef('');
  const finalTranscriptRef = useRef('');
  const wantListeningRef = useRef(false);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [voiceSupported] = useState(() => Boolean(getSpeechRecognition()));

  valueRef.current = value;

  useEffect(() => {
    return () => {
      wantListeningRef.current = false;
      try {
        recognitionRef.current?.abort();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    };
  }, []);

  // Grow the prompt with wrapped / multi-line text so earlier lines stay visible.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const next = Math.min(el.scrollHeight, 160);
    el.style.height = `${Math.max(next, 24)}px`;
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && !loading && value.trim()) onSend();
    }
  };

  const stopVoice = () => {
    wantListeningRef.current = false;
    setListening(false);
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (!recognition) return;
    try {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.stop();
    } catch {
      try {
        recognition.abort();
      } catch {
        // ignore
      }
    }
  };

  const startVoice = () => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      setVoiceError('Voice typing is not supported in this browser. Try Chrome or Edge.');
      return;
    }

    setVoiceError(null);
    stopVoice();

    baseTextRef.current = valueRef.current;
    finalTranscriptRef.current = '';
    wantListeningRef.current = true;

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.lang = resolveSpeechLang();

    recognition.onresult = (event) => {
      let interim = '';
      let newlyFinal = '';

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const piece = result?.[0]?.transcript ?? '';
        if (!piece) continue;
        if (result.isFinal) newlyFinal += piece;
        else interim += piece;
      }

      if (newlyFinal) {
        const prev = finalTranscriptRef.current;
        const needsSpace =
          prev.length > 0 && !/\s$/.test(prev) && !/^\s/.test(newlyFinal);
        finalTranscriptRef.current = `${prev}${needsSpace ? ' ' : ''}${newlyFinal}`;
      }

      onChange(
        joinTranscript(baseTextRef.current, finalTranscriptRef.current, interim),
      );
    };

    recognition.onerror = (event) => {
      const code = event?.error || '';
      // Benign / recoverable — keep listening when possible.
      if (code === 'no-speech' || code === 'aborted') return;
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        wantListeningRef.current = false;
        setListening(false);
        setVoiceError('Microphone permission is blocked. Allow mic access and try again.');
        return;
      }
      if (code === 'network') {
        setVoiceError('Voice service network error. Check your connection and try again.');
      }
      wantListeningRef.current = false;
      setListening(false);
    };

    recognition.onend = () => {
      // Chrome often ends continuous sessions after a pause — restart while mic should stay on.
      if (wantListeningRef.current) {
        try {
          recognition.start();
          return;
        } catch {
          // Fall through and clear UI if restart fails.
        }
      }
      setListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch {
      wantListeningRef.current = false;
      setListening(false);
      setVoiceError('Could not start voice typing. Click the mic and try again.');
    }
  };

  const toggleVoice = () => {
    if (listening || wantListeningRef.current) {
      onChange(joinTranscript(baseTextRef.current, finalTranscriptRef.current, ''));
      stopVoice();
      return;
    }
    startVoice();
  };

  return (
    <div className="chat-input-area">
      {attachedDocs.length > 0 && (
        <div className="attached-docs">
          {attachedDocs.map((doc) => (
            <span key={doc._id} className="chip">
              📎 {doc.originalName}
              <button type="button" onClick={() => onRemoveDoc(doc._id)} aria-label="Remove">
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {voiceError && (
        <p className="voice-error" role="status">
          {voiceError}
        </p>
      )}

      <div className="qa-input-pill">
        <textarea
          ref={textareaRef}
          rows={1}
          placeholder={
            listening
              ? 'Listening… speak clearly'
              : webSearch
                ? 'Ask with live Google, YouTube & Reddit search…'
                : 'Ask Quantum AI anything…'
          }
          value={value}
          onChange={(e) => {
            if (wantListeningRef.current) {
              baseTextRef.current = e.target.value;
              finalTranscriptRef.current = '';
            }
            onChange(e.target.value);
          }}
          onKeyDown={handleKeyDown}
          disabled={disabled && !loading}
          aria-label="Prompt"
        />
        <div className="qa-input-actions">
          <button
            type="button"
            className="qa-input-btn attach"
            onClick={() => fileRef.current?.click()}
            title="Upload documents"
            disabled={loading}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </button>
          <button
            type="button"
            className="qa-input-btn attach"
            onClick={() => setCameraOpen(true)}
            title="Take a photo"
            disabled={loading}
            aria-label="Take a photo"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
              <circle cx="12" cy="13" r="3" />
            </svg>
          </button>
          {onWebSearchChange && (
            <button
              type="button"
              className={`qa-input-btn attach ${webSearch ? 'search-active' : ''}`}
              onClick={() => onWebSearchChange(!webSearch)}
              title={webSearch ? 'Live search on' : 'Search Google, YouTube & Reddit'}
              disabled={loading}
              aria-pressed={webSearch}
              aria-label="Toggle live web search"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </button>
          )}
          {voiceSupported && (
            <button
              type="button"
              className={`qa-input-btn attach ${listening ? 'listening' : ''}`}
              onClick={toggleVoice}
              title={listening ? 'Stop voice typing' : 'Voice typing'}
              aria-pressed={listening}
              aria-label={listening ? 'Stop voice typing' : 'Start voice typing'}
              disabled={loading}
            >
              {listening ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="22" />
                </svg>
              )}
            </button>
          )}
          {loading ? (
            <button type="button" className="qa-input-btn attach stop" onClick={onStop} title="Stop generation">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              className="qa-input-btn send"
              onClick={onSend}
              disabled={disabled || !value.trim()}
              title="Send message"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <input
        ref={fileRef}
        className="hidden-input"
        type="file"
        multiple
        accept=".pdf,.docx,.doc,.txt,.md,.markdown,.csv,.xlsx,.xls,.json,.jpg,.jpeg,.png,.gif,.webp"
        onChange={(e) => {
          if (e.target.files?.length) onAttach(e.target.files);
          e.target.value = '';
        }}
      />

      <CameraCapture
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(file) => onAttach([file])}
      />
    </div>
  );
}
