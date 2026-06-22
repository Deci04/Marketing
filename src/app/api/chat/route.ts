import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { currentContext } from "@/lib/current";
import {
  getOrCreateWorkspaceThread,
  saveAssistantMessage,
  saveUserMessage,
} from "@/lib/chat";
import { readOnlyTools } from "@/lib/chat-tools";
import { writeTools } from "@/lib/chat-write-tools";

export const maxDuration = 60;

// Claude (recent). The Anthropic provider passes this id straight to the
// Messages API. Per the project's claude-api guidance this is the current Opus.
const MODEL_ID = "claude-opus-4-8";

const SYSTEM_PROMPT = `Sei l'assistente condiviso di un tool di gestione contenuti per il personal brand di Luca.
Rispondi in italiano, in modo conciso e concreto.
La chat è CONDIVISA tra più persone del workspace (Matteo e Luca): più utenti possono scriverti.

Hai strumenti di sola LETTURA (blocchi, contenuti, calendario, KPI, classi): usali liberamente per rispondere con dati reali invece di inventare.

Hai anche strumenti di SCRITTURA/azione (creare blocchi e contenuti, aggiornare/eliminare contenuti e performance, pianificare eventi di calendario, registrare conversazioni di valore, aggiungere commenti, creare classi e assegnarle). Quando l'utente chiede un'azione:
- Raccogli i parametri necessari (chiedi se mancano informazioni essenziali).
- Chiama lo strumento appropriato: l'utente vedrà una richiesta di CONFERMA prima che l'azione venga eseguita. Non serve che chieda tu conferma a parole: pensa allo strumento come a una proposta.
- Quando un'azione NON viene approvata, NON riprovarla: spiega che è stata annullata e chiedi come procedere.
- Per modificare/eliminare un contenuto serve il suo id: ricavalo prima con searchContents.`;

/** Extract the latest user text from a UI message's parts (for persistence). */
function uiMessageText(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("")
    .trim();
}

/** Is this UI message a fresh user turn (not an approval-response continuation)? */
function isPlainUserTurn(message: UIMessage | undefined): boolean {
  if (!message || message.role !== "user") return false;
  // Approval responses ride along on the trailing assistant message, so a real
  // new user turn is one whose parts are just text.
  return message.parts.every((p) => p.type === "text");
}

export async function POST(req: Request) {
  const ctx = await currentContext();
  if (!ctx) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { workspaceId, user } = ctx;

  let body: { messages?: UIMessage[] };
  try {
    body = await req.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const messages = body.messages;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return new Response("Missing messages", { status: 400 });
  }

  const thread = await getOrCreateWorkspaceThread(workspaceId);

  // Persist a brand-new user turn (with attribution) so it survives reloads and
  // is visible to the other workspace member. Approval-response continuations
  // (which re-send the same user message) are NOT new turns and are skipped.
  const last = messages[messages.length - 1];
  if (isPlainUserTurn(last)) {
    const text = uiMessageText(last);
    if (text) {
      await saveUserMessage(workspaceId, thread.id, user.id, text);
    }
  }

  // Graceful degradation: with no API key (and no AI Gateway), the chat still
  // persists + shows attributed user messages, and the assistant replies with a
  // clear "not configured yet" message instead of crashing. No write actions are
  // proposed until a key is present.
  const hasKey =
    !!process.env.ANTHROPIC_API_KEY ||
    !!process.env.ANTHROPIC_AUTH_TOKEN ||
    !!process.env.AI_GATEWAY_API_KEY;

  if (!hasKey) {
    const notice =
      "L'AI non è ancora configurata. Il messaggio è stato salvato e tutti nel workspace lo vedranno. Per attivare le risposte e le azioni dell'assistente, imposta la variabile d'ambiente ANTHROPIC_API_KEY (o configura l'AI Gateway di Vercel).";
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

  const result = streamText({
    model: anthropic(MODEL_ID),
    system: SYSTEM_PROMPT,
    // The client owns the shared thread state (seeded from the DB on load),
    // including any in-flight tool-approval parts — so converting the client
    // messages preserves the approval round-trip across requests.
    messages: await convertToModelMessages(messages),
    tools: {
      ...readOnlyTools(workspaceId),
      // Write tools require explicit user approval (needsApproval: true) before
      // their execute() runs. Bound to this workspace + acting user.
      ...writeTools(workspaceId, user.id),
    },
    stopWhen: stepCountIs(8),
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
