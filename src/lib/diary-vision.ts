import { generateText, Output } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

const MODEL_ID = "claude-opus-4-8";

const visionSchema = z.object({
  title: z.string().describe("Titolo brevissimo (max 6 parole), in italiano"),
  description: z
    .string()
    .describe("Descrizione oggettiva e concreta di cosa mostra la foto, in italiano"),
});

function hasKey(): boolean {
  return (
    !!process.env.ANTHROPIC_API_KEY ||
    !!process.env.ANTHROPIC_AUTH_TOKEN ||
    !!process.env.AI_GATEWAY_API_KEY
  );
}

export function buildVisionPrompt(caption?: string | null): string {
  const base =
    "Descrivi questa foto per il diario di lavoro di un creator. " +
    "Sii concreto e sintetico: cosa si vede, dove, che tipo di scena. " +
    "Non inventare dettagli non visibili.";
  return caption?.trim()
    ? `${base}\nDidascalia fornita dall'autore: "${caption.trim()}".`
    : base;
}

/** Vision su foto Telegram. Byte TRANSITORI: scartati dal chiamante subito dopo. */
export async function describePhoto(
  bytes: Uint8Array,
  caption?: string | null
): Promise<{ aiTitle: string; aiDescription: string } | null> {
  if (!hasKey() || bytes.length === 0) return null;
  try {
    const { output } = await generateText({
      model: anthropic(MODEL_ID),
      output: Output.object({ schema: visionSchema }),
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: buildVisionPrompt(caption) },
            { type: "image", image: bytes },
          ],
        },
      ],
    });
    return { aiTitle: output.title, aiDescription: output.description };
  } catch {
    return null; // best-effort: la voce si salva comunque senza descrizione
  }
}
