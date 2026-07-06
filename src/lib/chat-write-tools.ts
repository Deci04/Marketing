import { tool } from "ai";
import { z } from "zod";
import {
  createBlock,
  createContent,
  updateContent,
  deleteContent,
  addComment,
} from "@/lib/content";
import { addEvent } from "@/lib/calendar";
import { addValueConversation } from "@/lib/kpi";
import { createClass, setContentClasses } from "@/lib/classes";
import type { Channel, ContentFormat } from "@prisma/client";

/**
 * WRITE / ACTION tools for the shared workspace assistant (F3, second half).
 *
 * Every tool here is a *mutation*. By product decision (spec §1, §4) the model
 * is NOT allowed to mutate anything silently: every write tool sets
 * `needsApproval: true`, so the AI SDK pauses and surfaces a `approval-requested`
 * tool part to the client. The action runs (its `execute`) ONLY after the user
 * presses "Conferma" (`addToolApprovalResponse({ approved: true })`). On
 * "Annulla" the model is told the action was denied and reports it.
 *
 * Tools wrap the existing data-layer functions (content.ts / calendar.ts /
 * kpi.ts / classes.ts) so the business logic and the mandatory
 * `scopedWhere(workspaceId)` stay a single source of truth. The workspaceId is
 * bound at construction time and is never an input, so the model can never widen
 * the scope or escape the workspace. The acting user's id is bound too (used for
 * comment attribution).
 *
 * Read-only tools live in chat-tools.ts and do NOT need approval.
 */

const channelSchema = z.enum(["INSTAGRAM", "YOUTUBE", "TIKTOK"]);
const formatSchema = z.enum(["REEL", "CAROUSEL", "STORY", "LONG_VIDEO"]);

/** Parse a YYYY-MM-DD (or ISO) date string to a Date, or null. */
function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("it-IT", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

/**
 * Write tools bound to a single workspace + acting user.
 * @param workspaceId scoping for every mutation (never an input)
 * @param userId author for comments / attribution
 */
export function writeTools(workspaceId: string, userId: string) {
  return {
    createBlockTool: tool({
      description:
        "Crea un nuovo BLOCCO (raggruppamento di contenuti) nel workspace, con etichetta e scadenze di consegna opzionali (Luca/Matteo). Richiede conferma dell'utente.",
      inputSchema: z.object({
        label: z.string().min(1).describe("Etichetta del blocco, es. 'Settimana 26'"),
        lucaDeliveryDate: z
          .string()
          .optional()
          .describe("Scadenza consegna materiali di Luca (YYYY-MM-DD)"),
        matteoDeliveryDate: z
          .string()
          .optional()
          .describe("Scadenza revisione di Matteo (YYYY-MM-DD)"),
      }),
      needsApproval: true,
      execute: async ({ label, lucaDeliveryDate, matteoDeliveryDate }) => {
        const block = await createBlock(workspaceId, {
          label,
          lucaDeliveryAt: parseDate(lucaDeliveryDate),
          matteoDeliveryAt: parseDate(matteoDeliveryDate),
        });
        return { ok: true, id: block.id, label: block.label };
      },
    }),

    createContentTool: tool({
      description:
        "Crea un nuovo CONTENUTO nel workspace (titolo, canale, formato, data di pubblicazione, blocco, hook, note). Richiede conferma.",
      inputSchema: z.object({
        title: z.string().min(1).describe("Titolo del contenuto"),
        channel: channelSchema.describe("Canale di pubblicazione"),
        format: formatSchema.optional().describe("Formato del contenuto"),
        publishDate: z
          .string()
          .optional()
          .describe("Data di pubblicazione programmata (YYYY-MM-DD)"),
        blockId: z
          .string()
          .optional()
          .describe("Id del blocco a cui assegnare il contenuto (usa listBlocks)"),
        hook: z.string().optional().describe("Hook/gancio iniziale"),
        notes: z.string().optional().describe("Note libere"),
        classIds: z
          .array(z.string())
          .optional()
          .describe("Id delle classi da assegnare (usa listClasses)"),
      }),
      needsApproval: true,
      execute: async (args) => {
        const content = await createContent(workspaceId, {
          title: args.title,
          channel: args.channel as Channel,
          format: (args.format as ContentFormat | undefined) ?? null,
          publishAt: parseDate(args.publishDate),
          blockId: args.blockId ?? null,
          hook: args.hook ?? null,
          notes: args.notes ?? null,
          classIds: args.classIds ?? [],
        });
        return { ok: true, id: content.id, title: content.title };
      },
    }),

    updateContentTool: tool({
      description:
        "Aggiorna un CONTENUTO esistente: titolo, hook, data di pubblicazione, formato e/o metriche di PERFORMANCE (views, reach, nonFollowerPct, likes, commentsCount, saves, shares, followsGenerated). Passa solo i campi da cambiare. Richiede conferma.",
      inputSchema: z.object({
        id: z.string().describe("Id del contenuto da aggiornare (usa searchContents)"),
        title: z.string().optional(),
        hook: z.string().optional(),
        publishDate: z.string().optional().describe("Nuova data pubblicazione (YYYY-MM-DD)"),
        format: formatSchema.optional(),
        views: z.number().optional(),
        reach: z.number().optional(),
        nonFollowerPct: z.number().optional().describe("% non-follower (0-100)"),
        likes: z.number().optional(),
        commentsCount: z.number().optional(),
        saves: z.number().optional(),
        shares: z.number().optional(),
        followsGenerated: z.number().optional(),
      }),
      needsApproval: true,
      execute: async (args) => {
        const { id, publishDate, format, ...rest } = args;
        const updated = await updateContent(workspaceId, id, {
          ...rest,
          ...(format !== undefined ? { format: format as ContentFormat } : {}),
          ...(publishDate !== undefined
            ? { publishAt: parseDate(publishDate) }
            : {}),
        });
        if (!updated) return { ok: false, error: "Contenuto non trovato nel workspace." };
        return { ok: true, id: updated.id, title: updated.title };
      },
    }),

    deleteContentTool: tool({
      description:
        "Elimina definitivamente un CONTENUTO (e i suoi commenti) dal workspace. Azione distruttiva: richiede conferma.",
      inputSchema: z.object({
        id: z.string().describe("Id del contenuto da eliminare (usa searchContents)"),
      }),
      needsApproval: true,
      execute: async ({ id }) => {
        const deleted = await deleteContent(workspaceId, id);
        if (!deleted) return { ok: false, error: "Contenuto non trovato nel workspace." };
        return { ok: true, id };
      },
    }),

    scheduleEventTool: tool({
      description:
        "Crea un EVENTO di calendario nel workspace (es. una pubblicazione o una scadenza ad hoc), con data, titolo e responsabile opzionale (LUCA/MATTEO). Richiede conferma.",
      inputSchema: z.object({
        date: z.string().describe("Data dell'evento (YYYY-MM-DD)"),
        title: z.string().min(1).describe("Titolo dell'evento"),
        responsible: z
          .enum(["LUCA", "MATTEO"])
          .optional()
          .describe("Responsabile dell'evento"),
      }),
      needsApproval: true,
      execute: async ({ date, title, responsible }) => {
        const d = parseDate(date);
        if (!d) return { ok: false, error: "Data non valida." };
        const event = await addEvent(workspaceId, {
          date: d,
          title,
          responsible: responsible ?? null,
        });
        return { ok: true, id: event.id, title: event.title };
      },
    }),

    addValueConversationTool: tool({
      description:
        "Registra una CONVERSAZIONE DI VALORE (la North Star metric): chi (who), cosa (what), data, canale e link opzionali. Richiede conferma.",
      inputSchema: z.object({
        who: z.string().min(1).describe("Con chi è avvenuta la conversazione"),
        what: z.string().min(1).describe("Di cosa si è parlato / esito di valore"),
        date: z.string().optional().describe("Data (YYYY-MM-DD), default oggi"),
        channel: z.string().optional().describe("Canale, es. Instagram"),
        link: z.string().optional().describe("Link di riferimento"),
      }),
      needsApproval: true,
      execute: async ({ who, what, date, channel, link }) => {
        const vc = await addValueConversation(workspaceId, {
          who,
          what,
          date: parseDate(date),
          channel: channel ?? null,
          link: link ?? null,
        });
        return { ok: true, id: vc.id };
      },
    }),

    addCommentTool: tool({
      description:
        "Aggiunge un COMMENTO (attribuito all'utente corrente) a un contenuto o a un blocco. Specifica contentId OPPURE blockId. Richiede conferma.",
      inputSchema: z.object({
        body: z.string().min(1).describe("Testo del commento"),
        contentId: z.string().optional().describe("Id del contenuto da commentare"),
        blockId: z.string().optional().describe("Id del blocco da commentare"),
      }),
      needsApproval: true,
      execute: async ({ body, contentId, blockId }) => {
        if (!contentId && !blockId) {
          return { ok: false, error: "Serve contentId o blockId." };
        }
        const comment = await addComment(workspaceId, {
          authorId: userId,
          body,
          contentId: contentId ?? null,
          blockId: blockId ?? null,
        });
        return { ok: true, id: comment.id };
      },
    }),

    createClassTool: tool({
      description:
        "Crea una nuova CLASSE/etichetta di contenuto (tassonomia) con nome e colore pastello opzionale (lavender, butter, blush, sage, coral). Richiede conferma.",
      inputSchema: z.object({
        name: z.string().min(1).describe("Nome della classe"),
        color: z
          .enum(["lavender", "butter", "blush", "sage", "coral"])
          .optional()
          .describe("Colore pastello"),
      }),
      needsApproval: true,
      execute: async ({ name, color }) => {
        const cls = await createClass(workspaceId, { name, color: color ?? null });
        return { ok: true, id: cls.id, name: cls.name };
      },
    }),

    assignClassesTool: tool({
      description:
        "Imposta l'INSIEME COMPLETO delle classi assegnate a un contenuto (sostituisce quelle esistenti). Passa l'elenco completo degli id classe desiderati (vuoto = rimuove tutte). Richiede conferma.",
      inputSchema: z.object({
        contentId: z.string().describe("Id del contenuto"),
        classIds: z
          .array(z.string())
          .describe("Elenco completo degli id classe da assegnare"),
      }),
      needsApproval: true,
      execute: async ({ contentId, classIds }) => {
        const updated = await setContentClasses(workspaceId, contentId, classIds);
        if (!updated) return { ok: false, error: "Contenuto non trovato nel workspace." };
        return { ok: true, id: contentId };
      },
    }),
  };
}

/** Names of the write tools (handy for the client to detect approval cards). */
export const WRITE_TOOL_NAMES = [
  "createBlockTool",
  "createContentTool",
  "updateContentTool",
  "deleteContentTool",
  "scheduleEventTool",
  "addValueConversationTool",
  "addCommentTool",
  "createClassTool",
  "assignClassesTool",
] as const;

export type WriteToolName = (typeof WRITE_TOOL_NAMES)[number];

/**
 * Human-readable summary of a proposed write action, shown in the confirm card.
 * Pure (no I/O) so it can be unit-tested and reused on the client.
 */
// describeAction è stato spostato in `@/lib/chat-describe` (modulo puro, client-safe).
// Ri-esportato qui per compatibilità con eventuali import server-side esistenti.
export { describeAction } from "@/lib/chat-describe";
