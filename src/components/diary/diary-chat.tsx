"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type UIMessage,
} from "ai";
import {
  PaperPlaneTilt,
  Sparkle,
  Check,
  Prohibit,
  X,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { describeAction } from "@/lib/chat-describe";

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

/** Convert a stored DB message into a minimal UIMessage to seed model context. */
function storedToUIMessage(m: StoredMessage): UIMessage {
  return {
    id: m.id,
    role: m.role === "assistant" ? "assistant" : "user",
    parts: [{ type: "text", text: m.content }],
  };
}

/** Plain text of a UIMessage's text parts. */
function uiText(m: UIMessage): string {
  return m.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

/** A tool part still awaiting the user's confirmation. */
type ApprovalPart = {
  type: string; // `tool-<name>`
  toolCallId: string;
  state: string;
  input?: Record<string, unknown>;
  approval?: { id: string };
};

function approvalParts(m: UIMessage): ApprovalPart[] {
  return (m.parts as ApprovalPart[]).filter(
    (p) =>
      typeof p.type === "string" &&
      p.type.startsWith("tool-") &&
      p.state === "approval-requested" &&
      p.approval?.id
  );
}

export function DiaryChat({ userName }: { userName: string }) {
  const [authorByMsgId, setAuthorByMsgId] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState("");
  const seededRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { sendMessage, messages, setMessages, status, addToolApprovalResponse } =
    useChat({
      transport: new DefaultChatTransport({
        api: "/api/diario",
        prepareSendMessagesRequest({ messages }) {
          return { body: { messages } };
        },
      }),
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
      onError: (error) => {
        console.error(error);
        toast.error("Errore con l'assistente. Riprova.");
      },
    });

  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/diario/messages", { cache: "no-store" });
      if (!res.ok || cancelled) return;
      const data: HistoryResponse = await res.json();
      if (cancelled) return;
      setAuthorByMsgId(
        Object.fromEntries(
          data.messages.filter((m) => m.author).map((m) => [m.id, m.author!.name])
        )
      );
      setMessages(data.messages.map(storedToUIMessage));
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [setMessages]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const busy = status === "submitted" || status === "streaming";

  const hasPendingApproval = useMemo(
    () => messages.some((m) => approvalParts(m).length > 0),
    [messages]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy || hasPendingApproval) return;
    sendMessage({ text });
    setInput("");
  };

  const respond = (approvalId: string, approved: boolean) => {
    addToolApprovalResponse({ id: approvalId, approved });
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-cream">
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {!loaded && (
          <p className="text-center text-sm text-ink/45">Caricamento…</p>
        )}
        {loaded && messages.length === 0 && (
          <div className="mt-10 text-center text-sm text-ink/55">
            <p className="mb-1 font-medium text-ink">Il diario è vuoto</p>
            <p>
              Chiedi spunti su ciò che Luca ha girato, oppure di creare un
              contenuto o un evento dal materiale del diario. Confermerai ogni
              azione prima che venga eseguita.
            </p>
          </div>
        )}

        {messages.map((m) => {
          const isAssistant = m.role === "assistant";
          const authorName = isAssistant
            ? "Assistente"
            : authorByMsgId[m.id] ?? userName;
          const isMine =
            !isAssistant &&
            (authorByMsgId[m.id] == null || authorName === userName);
          const text = uiText(m);
          const approvals = approvalParts(m);
          const executed = executedActions(m);

          return (
            <div key={m.id} className="space-y-2">
              {text && (
                <MessageBubble
                  authorName={authorName}
                  isAssistant={isAssistant}
                  isMine={isMine}
                  content={text}
                />
              )}

              {approvals.map((p) => (
                <ConfirmCard
                  key={p.toolCallId}
                  summary={describeAction(
                    p.type.replace(/^tool-/, ""),
                    p.input ?? {}
                  )}
                  disabled={busy}
                  onConfirm={() => respond(p.approval!.id, true)}
                  onCancel={() => respond(p.approval!.id, false)}
                />
              ))}

              {executed.map((e) => (
                <ActionResult
                  key={e.toolCallId}
                  summary={describeAction(e.toolName, e.input ?? {})}
                  ok={e.ok}
                  denied={e.denied}
                />
              ))}
            </div>
          );
        })}

        {status === "submitted" && (
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
          placeholder={
            hasPendingApproval
              ? "Conferma o annulla l'azione proposta…"
              : "Scrivi un messaggio…"
          }
          disabled={hasPendingApproval}
          className="max-h-32 min-h-9 flex-1 resize-none rounded-xl border border-border bg-paper px-3 py-2 text-sm text-ink outline-none placeholder:text-ink/40 focus:border-ring disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={busy || hasPendingApproval || !input.trim()}
          aria-label="Invia"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ink text-paper transition-opacity disabled:opacity-40"
        >
          <PaperPlaneTilt size={18} weight="fill" />
        </button>
      </form>
    </div>
  );
}

/** Resolved write-tool parts on an assistant message (executed / denied). */
type ResolvedAction = {
  toolCallId: string;
  toolName: string;
  input?: Record<string, unknown>;
  ok: boolean;
  denied: boolean;
};

function executedActions(m: UIMessage): ResolvedAction[] {
  if (m.role !== "assistant") return [];
  const out: ResolvedAction[] = [];
  for (const part of m.parts as Array<{
    type: string;
    toolCallId?: string;
    state?: string;
    input?: Record<string, unknown>;
    output?: { ok?: boolean };
  }>) {
    if (!part.type?.startsWith("tool-") || !part.toolCallId) continue;
    const toolName = part.type.replace(/^tool-/, "");
    if (part.state === "output-available") {
      out.push({
        toolCallId: part.toolCallId,
        toolName,
        input: part.input,
        ok: part.output?.ok !== false,
        denied: false,
      });
    } else if (part.state === "output-denied") {
      out.push({
        toolCallId: part.toolCallId,
        toolName,
        input: part.input,
        ok: false,
        denied: true,
      });
    } else if (part.state === "output-error") {
      out.push({
        toolCallId: part.toolCallId,
        toolName,
        input: part.input,
        ok: false,
        denied: false,
      });
    }
  }
  return out;
}

function ConfirmCard({
  summary,
  disabled,
  onConfirm,
  onCancel,
}: {
  summary: string;
  disabled: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="ml-9 rounded-2xl border border-lavender-ink/20 bg-lavender/40 p-3 text-sm">
      <p className="mb-2 flex items-start gap-1.5 text-ink">
        <Sparkle size={15} weight="fill" className="mt-0.5 shrink-0 text-lavender-ink" />
        <span>
          <span className="font-medium">Conferma azione · </span>
          {summary}
        </span>
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={disabled}
          className="flex items-center gap-1 rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          <Check size={14} weight="bold" /> Conferma
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={disabled}
          className="flex items-center gap-1 rounded-lg border border-border bg-paper px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-secondary disabled:opacity-40"
        >
          <Prohibit size={14} /> Annulla
        </button>
      </div>
    </div>
  );
}

function ActionResult({
  summary,
  ok,
  denied,
}: {
  summary: string;
  ok: boolean;
  denied: boolean;
}) {
  const label = denied ? "Azione annullata" : ok ? "Azione eseguita" : "Azione non riuscita";
  const tone = denied
    ? "border-border bg-secondary text-ink/70"
    : ok
      ? "border-sage-ink/25 bg-sage/40 text-ink"
      : "border-coral-ink/25 bg-coral/40 text-ink";
  return (
    <div className={`ml-9 rounded-2xl border p-2.5 text-xs ${tone}`}>
      <p className="flex items-start gap-1.5">
        {denied ? (
          <Prohibit size={14} className="mt-0.5 shrink-0" />
        ) : ok ? (
          <Check size={14} weight="bold" className="mt-0.5 shrink-0" />
        ) : (
          <X size={14} className="mt-0.5 shrink-0" />
        )}
        <span>
          <span className="font-medium">{label} · </span>
          {summary}
        </span>
      </p>
    </div>
  );
}

function MessageBubble({
  authorName,
  isAssistant,
  isMine,
  content,
}: {
  authorName: string;
  isAssistant: boolean;
  isMine: boolean;
  content: string;
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
