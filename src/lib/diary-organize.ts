import { generateText, Output } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

// C2 — "Riorganizza informazioni": raggruppa il materiale grezzo del diario in
// schede-contenuto (principale vs contesto/B-roll) con brief a 4 facce.
const MODEL_ID = "claude-sonnet-5";

export const organizeSchema = z.object({
  schede: z.array(
    z.object({
      titolo: z.string().describe("Titolo breve del contenuto, in italiano"),
      contesto: z.string().describe("Dov'è / la situazione"),
      intento: z.string().describe("Cosa vuole ottenere con questo contenuto"),
      cosaDice: z.string().describe("Sintesi di note/parlato rilevanti"),
      messaggio: z.string().describe("Cosa vuole trasmettere"),
      media: z.array(
        z.object({
          entryId: z.string(),
          ruolo: z.enum(["principale", "contesto"]),
        })
      ),
    })
  ),
});
export type OrganizeResult = z.infer<typeof organizeSchema>;

export type OrganizeEntry = {
  id: string;
  mediaType: string | null; // "image" | "video" | "audio" | "file" | "text"
  rawText: string | null;
  caption: string | null;
  aiTitle: string | null;
  aiDescription: string | null;
};

function line(e: OrganizeEntry): string {
  const kind = (e.mediaType ?? "testo").toUpperCase();
  const bits: string[] = [`[id:${e.id}] ${kind}`];
  const desc = e.aiDescription ?? e.aiTitle;
  if (desc) bits.push(`descrizione: "${desc}"`);
  const text = e.rawText ?? e.caption;
  if (text) bits.push(`nota: "${text}"`);
  return "- " + bits.join(" · ");
}

export function buildOrganizePrompt(entries: OrganizeEntry[]): string {
  return [
    "Sei l'assistente di un editor video. Ecco il materiale grezzo che il creator ha",
    "condiviso nel diario (foto, video, audio, note), in ordine cronologico:",
    "",
    ...entries.map(line),
    "",
    "Compito: raggruppa questo materiale in CONTENUTI distinti (post/video separati).",
    "Per ogni contenuto distingui i media PRINCIPALI da quelli di CONTESTO/B-roll (clip",
    "usate per arricchire il principale). Per ogni contenuto scrivi un brief: contesto",
    "(dov'è), intento (cosa vuole), cosa dice (note/parlato), messaggio (cosa vuole",
    "trasmettere). Usa SOLO gli id elencati sopra per riferirti ai media, e includi ogni",
    "media in al più un contenuto. Rispondi in italiano.",
  ].join("\n");
}

function hasKey(): boolean {
  return (
    !!process.env.ANTHROPIC_API_KEY ||
    !!process.env.ANTHROPIC_AUTH_TOKEN ||
    !!process.env.AI_GATEWAY_API_KEY
  );
}

export type OrganizeFn = (prompt: string) => Promise<OrganizeResult>;

async function generateOrganize(prompt: string): Promise<OrganizeResult> {
  const { output } = await generateText({
    model: anthropic(MODEL_ID),
    output: Output.object({ schema: organizeSchema }),
    messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
  });
  return output;
}

/**
 * Raggruppa il materiale del diario in schede-contenuto. `generate` è iniettabile
 * per i test. Post-processa scartando i media con `entryId` inesistenti (anti-allucinazione).
 */
export async function organizeDiary(
  entries: OrganizeEntry[],
  generate: OrganizeFn = generateOrganize
): Promise<OrganizeResult> {
  if (entries.length === 0) return { schede: [] };
  if (generate === generateOrganize && !hasKey())
    throw new Error("AI non configurata");

  const raw = await generate(buildOrganizePrompt(entries));
  const validIds = new Set(entries.map((e) => e.id));
  const schede = raw.schede
    .map((s) => ({ ...s, media: s.media.filter((m) => validIds.has(m.entryId)) }))
    .filter((s) => s.media.length > 0 || s.titolo.trim().length > 0);
  return { schede };
}
