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

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL_ID = "claude-opus-4-8";
const THREAD_TITLE = "Diario di Luca";

const SYSTEM_PROMPT = `Sei l'assistente del DIARIO di lavoro di Luca (creator).
Rispondi in italiano, conciso e concreto.
Il diario raccoglie note, foto e video che Luca invia da Telegram: usa lo strumento "searchDiary" per basarti su ciò che ha REALMENTE girato invece di inventare.
Aiuti Matteo a trasformare il materiale del diario in contenuti/eventi: proponi spunti concreti e, su richiesta, crea contenuti o eventi con gli strumenti di scrittura.
Quando crei/aggiorni qualcosa, l'utente vedrà una richiesta di CONFERMA prima dell'esecuzione: pensa allo strumento come a una proposta. Se un'azione viene annullata, non riprovarla.`;

function uiMessageText(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("")
    .trim();
}

function isPlainUserTurn(message: UIMessage | undefined): boolean {
  if (!message || message.role !== "user") return false;
  return message.parts.every((p) => p.type === "text");
}

export async function POST(req: Request) {
  const ctx = await currentContext();
  if (!ctx) return new Response("Unauthorized", { status: 401 });
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

  const thread = await getOrCreateWorkspaceThread(workspaceId, THREAD_TITLE);

  const last = messages[messages.length - 1];
  if (isPlainUserTurn(last)) {
    const text = uiMessageText(last);
    if (text) await saveUserMessage(workspaceId, thread.id, user.id, text);
  }

  const hasKey =
    !!process.env.ANTHROPIC_API_KEY ||
    !!process.env.ANTHROPIC_AUTH_TOKEN ||
    !!process.env.AI_GATEWAY_API_KEY;

  if (!hasKey) {
    const notice =
      "L'AI non è ancora configurata. Il messaggio è stato salvato. Imposta ANTHROPIC_API_KEY (o l'AI Gateway) per attivare le risposte.";
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
    messages: await convertToModelMessages(messages),
    tools: {
      ...readOnlyTools(workspaceId), // include searchDiary
      ...writeTools(workspaceId, user.id), // needsApproval: true
    },
    stopWhen: stepCountIs(8),
    onFinish: async ({ text: finalText }) => {
      const trimmed = (finalText ?? "").trim();
      if (trimmed) await saveAssistantMessage(workspaceId, thread.id, trimmed);
    },
  });

  result.consumeStream();
  return result.toUIMessageStreamResponse({
    onError: (error) => {
      console.error("[diario] stream error", error);
      return "Si è verificato un errore con l'assistente. Riprova.";
    },
  });
}
