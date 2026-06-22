import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  stepCountIs,
  streamText,
  type ModelMessage,
  type UIMessage,
} from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { currentContext } from "@/lib/current";
import {
  getOrCreateWorkspaceThread,
  loadThreadMessages,
  saveAssistantMessage,
  saveUserMessage,
} from "@/lib/chat";
import { readOnlyTools } from "@/lib/chat-tools";

export const maxDuration = 60;

// Claude (recent). The Anthropic provider passes this id straight to the
// Messages API. Per the project's claude-api guidance this is the current Opus.
const MODEL_ID = "claude-opus-4-8";

const SYSTEM_PROMPT = `Sei l'assistente condiviso di un tool di gestione contenuti per il personal brand di Luca.
Rispondi in italiano, in modo conciso e concreto.
La chat è CONDIVISA tra più persone del workspace (Matteo e Luca): più utenti possono scriverti.
Hai strumenti di sola LETTURA per consultare lo stato del workspace (blocchi, contenuti, calendario, KPI, classi): usali quando servono per rispondere con dati reali, invece di inventare.
NON puoi ancora creare, modificare o eliminare nulla: se ti chiedono un'azione di scrittura, spiega che la funzione di azione non è ancora attiva.`;

/** Pull the plain text out of a UI message's parts. */
function uiMessageText(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("")
    .trim();
}

export async function POST(req: Request) {
  const ctx = await currentContext();
  if (!ctx) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { workspaceId, user } = ctx;

  let body: { message?: UIMessage };
  try {
    body = await req.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const incoming = body.message;
  if (!incoming || incoming.role !== "user") {
    return new Response("Missing user message", { status: 400 });
  }
  const text = uiMessageText(incoming);
  if (!text) {
    return new Response("Empty message", { status: 400 });
  }

  const thread = await getOrCreateWorkspaceThread(workspaceId);

  // Persist the user's message first (with attribution) so it survives even if
  // the AI step fails or no key is configured.
  await saveUserMessage(workspaceId, thread.id, user.id, text);

  // Graceful degradation: with no API key (and no AI Gateway), the chat still
  // persists + shows attributed user messages, and the assistant replies with a
  // clear "not configured yet" message instead of crashing.
  const hasKey =
    !!process.env.ANTHROPIC_API_KEY ||
    !!process.env.ANTHROPIC_AUTH_TOKEN ||
    !!process.env.AI_GATEWAY_API_KEY;

  if (!hasKey) {
    const notice =
      "L'AI non è ancora configurata. Il messaggio è stato salvato e tutti nel workspace lo vedranno. Per attivare le risposte dell'assistente, imposta la variabile d'ambiente ANTHROPIC_API_KEY (o configura l'AI Gateway di Vercel).";
    await saveAssistantMessage(workspaceId, thread.id, notice);
    const stream = createUIMessageStream({
      execute: ({ writer }) => {
        writer.write({ type: "start", messageId: generateId() });
        writer.write({ type: "text-start", id: "0" });
        writer.write({ type: "text-delta", id: "0", delta: notice });
        writer.write({ type: "text-end", id: "0" });
      },
    });
    return createUIMessageStreamResponse({ stream });
  }

  // Build the model context from the full shared DB history (so context is
  // consistent across both users and across reloads), not just client state.
  const history = await loadThreadMessages(workspaceId, thread.id);
  const modelMessages: ModelMessage[] = history.map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content:
      m.role === "assistant"
        ? m.content
        : // Attribute the speaker inline so the shared assistant knows who said what.
          `[${m.author?.name ?? "Utente"}] ${m.content}`,
  }));

  const result = streamText({
    model: anthropic(MODEL_ID),
    system: SYSTEM_PROMPT,
    messages: modelMessages,
    tools: readOnlyTools(workspaceId),
    stopWhen: stepCountIs(6),
    onFinish: async ({ text: finalText }) => {
      const trimmed = (finalText ?? "").trim();
      if (trimmed) {
        await saveAssistantMessage(workspaceId, thread.id, trimmed);
      }
    },
  });

  // Run to completion even if the client disconnects, so the assistant reply is
  // persisted for everyone in the shared thread.
  result.consumeStream();

  return result.toUIMessageStreamResponse({
    onError: (error) => {
      console.error("[chat] stream error", error);
      return "Si è verificato un errore con l'assistente. Riprova.";
    },
  });
}
