// C2b — trascrizione audio via Groq Whisper (free tier), endpoint OpenAI-compatibile.
// Chiamata REST diretta (niente SDK → nessun accoppiamento di versione con `ai`).
// Best-effort: senza chiave o su errore ritorna null e l'audio resta senza transcript.
const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const MODEL = "whisper-large-v3-turbo";

export function hasGroqKey(): boolean {
  return !!process.env.GROQ_API_KEY;
}

export async function transcribeAudio(
  bytes: Uint8Array,
  filename = "audio.webm"
): Promise<string | null> {
  const key = process.env.GROQ_API_KEY;
  if (!key || bytes.length === 0) return null;
  try {
    const form = new FormData();
    form.append("file", new Blob([bytes as unknown as BlobPart]), filename);
    form.append("model", MODEL);
    form.append("response_format", "text");
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    return text || null;
  } catch {
    return null;
  }
}
