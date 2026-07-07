// Client Telegram Bot API — completato dal filone T (intake diario) / consumato da N.
const API = "https://api.telegram.org";
const token = () => process.env.TELEGRAM_BOT_TOKEN ?? "";

export function isConfigured(): boolean {
  return !!token();
}

/** Invia un messaggio a una chat. Degrada in silenzio se il bot non è configurato. */
export async function sendMessage(chatId: string, text: string): Promise<void> {
  if (!token() || !chatId) return;
  await fetch(`${API}/bot${token()}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  }).catch(() => {});
}

export type TelegramUpdate = {
  message?: {
    chat: { id: number };
    from?: { id: number; first_name?: string };
    text?: string;
    caption?: string;
    photo?: Array<{ file_id: string; file_size?: number }>;
    video?: { file_id: string };
    document?: { file_id: string };
  };
};

/** Verifica l'header del webhook contro il secret. Fail-closed se il secret non è configurato. */
export function verifyWebhookSecret(header: string | null): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";
  return !!expected && header === expected;
}

/** Se il testo è "/start <code>", ritorna il codice; altrimenti null. Puro. */
export function extractStartCode(text: string | undefined): string | null {
  if (!text) return null;
  const m = text.trim().match(/^\/start(?:@\w+)?\s+(\S+)/);
  return m ? m[1] : null;
}

/** Risolve un file_id nel suo file_path scaricabile (Telegram getFile). */
export async function getFilePath(fileId: string): Promise<string | null> {
  if (!token() || !fileId) return null;
  try {
    const res = await fetch(
      `${API}/bot${token()}/getFile?file_id=${encodeURIComponent(fileId)}`
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { result?: { file_path?: string } };
    return data.result?.file_path ?? null;
  } catch {
    return null;
  }
}

/** Scarica i byte di un file dato il suo file_path. Byte TRANSITORI (mai su Blob). */
export async function downloadFile(filePath: string): Promise<Uint8Array | null> {
  if (!token() || !filePath) return null;
  try {
    const res = await fetch(`${API}/file/bot${token()}/${filePath}`);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}
