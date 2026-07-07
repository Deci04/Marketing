import { db } from "@/lib/db";
import { pullChanges } from "@/lib/google-calendar";

export const dynamic = "force-dynamic";

/** POST /api/integrations/google/webhook — push channel di Google.
 *  NO currentContext(): non c'è sessione in una notifica push. Si valida il
 *  channelId contro GoogleCalendarConfig + un secret opzionale sul token.
 *  Risponde sempre 200 rapido (Google ritenta su non-2xx). */
export async function POST(req: Request) {
  const channelId = req.headers.get("x-goog-channel-id");
  const state = req.headers.get("x-goog-resource-state");
  const token = req.headers.get("x-goog-channel-token");

  if (!channelId) return new Response("ok", { status: 200 }); // non-Google → ignora

  const cfg = await db.googleCalendarConfig.findFirst({ where: { channelId } });
  if (!cfg) return new Response("ok", { status: 200 }); // canale sconosciuto → ignora

  if (
    process.env.GOOGLE_WEBHOOK_TOKEN &&
    token !== process.env.GOOGLE_WEBHOOK_TOKEN
  ) {
    return new Response("ok", { status: 200 }); // secret errato → ignora
  }

  if (state === "sync") return new Response("ok", { status: 200 }); // handshake iniziale

  await pullChanges(cfg.workspaceId).catch(() => {});
  return new Response("ok", { status: 200 });
}
