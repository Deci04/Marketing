import { verifyWebhookSecret, type TelegramUpdate } from "@/lib/telegram";
import { handleTelegramUpdate } from "@/lib/telegram-intake";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // Secret header (MAI currentContext): fail-closed.
  if (!verifyWebhookSecret(request.headers.get("x-telegram-bot-api-secret-token"))) {
    return new Response("forbidden", { status: 403 });
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return new Response("ok"); // 200: non far ritentare Telegram su body invalido
  }

  // Best-effort: qualunque errore interno → 200, per evitare retry storm di Telegram.
  try {
    await handleTelegramUpdate(update);
  } catch (err) {
    console.error("[telegram/webhook] handler error", err);
  }
  return new Response("ok");
}
