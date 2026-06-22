import { tool } from "ai";
import { z } from "zod";
import { listBlocks, listContents } from "@/lib/content";
import { getMonthEvents } from "@/lib/calendar";
import { getKpiOverview } from "@/lib/kpi";
import { listClasses } from "@/lib/classes";

/**
 * READ-ONLY tools for the shared workspace assistant (F3, first half).
 *
 * Each tool wraps an existing data-layer function so the workspace scoping and
 * business logic stay a single source of truth. Every tool is bound to one
 * workspaceId at construction time — the model can never widen the scope.
 *
 * NOTE: write/action tools (create block/content, schedule publication, etc.)
 * are intentionally NOT here yet. They belong to the second half of F3 and must
 * go through a human-in-the-loop confirmation step. Extension point: add them in
 * a separate `chat-write-tools.ts` and merge into the tool set behind a confirm
 * flow.
 */
export function readOnlyTools(workspaceId: string) {
  return {
    listBlocks: tool({
      description:
        "Elenca i blocchi (raggruppamenti di contenuti) del workspace, con etichetta e scadenze di consegna Luca/Matteo.",
      inputSchema: z.object({}),
      execute: async () => {
        const blocks = await listBlocks(workspaceId);
        return blocks.map((b) => ({
          id: b.id,
          label: b.label,
          startDate: b.startDate?.toISOString() ?? null,
          endDate: b.endDate?.toISOString() ?? null,
          lucaDeliveryAt: b.lucaDeliveryAt?.toISOString() ?? null,
          matteoDeliveryAt: b.matteoDeliveryAt?.toISOString() ?? null,
        }));
      },
    }),

    searchContents: tool({
      description:
        "Cerca/elenca i contenuti del workspace. Filtri opzionali per canale, e ricerca testuale su titolo/hook. Restituisce titolo, canale, formato, data di pubblicazione e blocco.",
      inputSchema: z.object({
        query: z
          .string()
          .optional()
          .describe("Testo da cercare nel titolo o nell'hook"),
        channel: z
          .enum(["INSTAGRAM", "YOUTUBE", "TIKTOK"])
          .optional()
          .describe("Filtra per canale"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe("Numero massimo di risultati (default 20)"),
      }),
      execute: async ({ query, channel, limit }) => {
        const all = await listContents(workspaceId);
        const q = query?.trim().toLowerCase();
        const filtered = all.filter((c) => {
          if (channel && c.channel !== channel) return false;
          if (q) {
            return (
              c.title.toLowerCase().includes(q) ||
              (c.hook ?? "").toLowerCase().includes(q)
            );
          }
          return true;
        });
        return filtered.slice(0, limit ?? 20).map((c) => ({
          id: c.id,
          title: c.title,
          channel: c.channel,
          format: c.format,
          publishAt: c.publishAt?.toISOString() ?? null,
          block: c.block?.label ?? null,
        }));
      },
    }),

    getCalendar: tool({
      description:
        "Restituisce gli eventi di calendario di un dato mese: consegne (Luca/Matteo) e pubblicazioni programmate. Indica anno e mese (1-12).",
      inputSchema: z.object({
        year: z.number().int().describe("Anno, es. 2026"),
        month: z
          .number()
          .int()
          .min(1)
          .max(12)
          .describe("Mese 1-12 (gennaio = 1)"),
      }),
      execute: async ({ year, month }) => {
        const events = await getMonthEvents(workspaceId, year, month - 1);
        return events.map((e) => ({
          date: e.date.toISOString(),
          kind: e.kind,
          label: e.label,
          owner: e.owner,
          channel: e.channel ?? null,
        }));
      },
    }),

    getKpiOverview: tool({
      description:
        "Panoramica KPI del workspace: engagement rate, % non-follower, numero di contenuti pubblicati e conversazioni di valore (la North Star metric).",
      inputSchema: z.object({}),
      execute: async () => {
        const o = await getKpiOverview(workspaceId);
        return {
          engagementRate: o.er,
          nonFollowerPct: o.nf,
          publishedCount: o.publishedCount,
          valueConversationsCount: o.vc.length,
          recentValueConversations: o.vc.slice(0, 5).map((v) => ({
            date: v.date.toISOString(),
            who: v.who,
            what: v.what,
            channel: v.channel,
          })),
        };
      },
    }),

    listClasses: tool({
      description:
        "Elenca le classi/etichette di contenuto definite nel workspace (tassonomia per categorizzare i contenuti).",
      inputSchema: z.object({}),
      execute: async () => {
        const classes = await listClasses(workspaceId);
        return classes.map((c) => ({ id: c.id, name: c.name, color: c.color }));
      },
    }),
  };
}
