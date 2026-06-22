"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ChatCircleDots, X, PaperPlaneTilt, Sparkle } from "@phosphor-icons/react";
import { toast } from "sonner";

type StoredMessage = {
  id: string;
  role: string;
  content: string;
  createdAt: string;
  author: { id: string; name: string } | null;
};

type HistoryResponse = {
  threadId: string;
  currentUserId: string;
  messages: StoredMessage[];
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function ChatPanel({ userName }: { userName: string }) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<StoredMessage[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { sendMessage, messages, status, setMessages } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      // Shared thread: only send the new message; the server loads the full
      // shared history from the DB for model context.
      prepareSendMessagesRequest({ messages }) {
        return { body: { message: messages[messages.length - 1] } };
      },
    }),
    onFinish: () => {
      // Refresh from the DB so the assistant reply is shown attributed and
      // persisted, and clear the transient streaming bubble.
      void refresh().then(() => setMessages([]));
    },
    onError: (error) => {
      console.error(error);
      toast.error("Errore con l'assistente. Riprova.");
    },
  });

  const refresh = useCallback(async () => {
    const res = await fetch("/api/chat/messages", { cache: "no-store" });
    if (!res.ok) return;
    const data: HistoryResponse = await res.json();
    setHistory(data.messages);
    setCurrentUserId(data.currentUserId);
    setLoaded(true);
  }, []);

  // Load shared history the first time the panel opens.
  useEffect(() => {
    if (open && !loaded) void refresh();
  }, [open, loaded, refresh]);

  // Keep scrolled to the latest message.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [history, messages, open]);

  const busy = status === "submitted" || status === "streaming";

  // Text of the in-flight assistant stream (transient until persisted).
  const streamingText = messages
    .filter((m) => m.role === "assistant")
    .flatMap((m) => m.parts)
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    // Optimistic: show the user's own message immediately, attributed.
    setHistory((prev) => [
      ...prev,
      {
        id: `optimistic-${Date.now()}`,
        role: "user",
        content: text,
        createdAt: new Date().toISOString(),
        author: { id: currentUserId ?? "me", name: userName },
      },
    ]);
    sendMessage({ text });
    setInput("");
  };

  return (
    <>
      {/* Toggle */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Apri assistente"
        aria-expanded={open}
        className="fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-2xl bg-ink text-paper shadow-lg transition-transform hover:scale-105"
      >
        <ChatCircleDots size={22} weight="fill" />
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-ink/20 backdrop-blur-[1px]"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      {/* Slide-over */}
      <aside
        className={`fixed right-0 top-0 z-50 flex h-screen w-full max-w-md flex-col border-l border-border bg-cream shadow-2xl transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        aria-hidden={!open}
      >
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-lavender text-lavender-ink">
              <Sparkle size={18} weight="fill" />
            </span>
            <div>
              <p className="font-heading text-base leading-tight text-ink">
                Assistente
              </p>
              <p className="text-xs text-ink/55">Chat condivisa del workspace</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Chiudi"
            className="flex h-8 w-8 items-center justify-center rounded-xl text-ink/55 transition-colors hover:bg-secondary hover:text-ink"
          >
            <X size={18} />
          </button>
        </header>

        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {!loaded && (
            <p className="text-center text-sm text-ink/45">Caricamento…</p>
          )}
          {loaded && history.length === 0 && !streamingText && (
            <div className="mt-10 text-center text-sm text-ink/55">
              <p className="mb-1 font-medium text-ink">Nessun messaggio</p>
              <p>
                Chiedi all&apos;assistente lo stato di contenuti, calendario o
                KPI. La conversazione è visibile a tutto il workspace.
              </p>
            </div>
          )}

          {history.map((m) => (
            <MessageBubble
              key={m.id}
              role={m.role}
              authorName={m.author?.name ?? "Assistente"}
              isAssistant={m.role === "assistant"}
              isMine={m.author?.id != null && m.author.id === currentUserId}
              content={m.content}
              time={formatTime(m.createdAt)}
            />
          ))}

          {/* Transient streaming assistant bubble */}
          {busy && streamingText && (
            <MessageBubble
              role="assistant"
              authorName="Assistente"
              isAssistant
              isMine={false}
              content={streamingText}
              time=""
            />
          )}
          {status === "submitted" && !streamingText && (
            <p className="text-sm text-ink/45">L&apos;assistente sta scrivendo…</p>
          )}
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex items-end gap-2 border-t border-border px-4 py-3"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            rows={1}
            placeholder="Scrivi un messaggio…"
            className="max-h-32 min-h-9 flex-1 resize-none rounded-xl border border-border bg-paper px-3 py-2 text-sm text-ink outline-none placeholder:text-ink/40 focus:border-ring"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            aria-label="Invia"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ink text-paper transition-opacity disabled:opacity-40"
          >
            <PaperPlaneTilt size={18} weight="fill" />
          </button>
        </form>
      </aside>
    </>
  );
}

function MessageBubble({
  authorName,
  isAssistant,
  isMine,
  content,
  time,
}: {
  role: string;
  authorName: string;
  isAssistant: boolean;
  isMine: boolean;
  content: string;
  time: string;
}) {
  return (
    <div className={`flex gap-2 ${isMine ? "flex-row-reverse" : "flex-row"}`}>
      <span
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-semibold ${
          isAssistant
            ? "bg-lavender text-lavender-ink"
            : isMine
              ? "bg-ink text-paper"
              : "bg-butter text-butter-ink"
        }`}
        title={authorName}
      >
        {isAssistant ? <Sparkle size={14} weight="fill" /> : initials(authorName)}
      </span>
      <div className={`max-w-[78%] ${isMine ? "items-end text-right" : ""}`}>
        <div className="mb-0.5 flex items-center gap-2 text-[11px] text-ink/50">
          <span className="font-medium text-ink/70">{authorName}</span>
          {time && <span>{time}</span>}
        </div>
        <div
          className={`whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
            isAssistant
              ? "bg-paper text-ink ring-1 ring-border"
              : isMine
                ? "bg-ink text-paper"
                : "bg-paper text-ink ring-1 ring-border"
          }`}
        >
          {content}
        </div>
      </div>
    </div>
  );
}
