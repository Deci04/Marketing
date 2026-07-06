import { currentContext } from "@/lib/current";
import {
  newOAuthClient,
  isConfigured,
  upsertGoogleAccount,
  ensureCalendar,
  syncAllForWorkspace,
  registerWatch,
} from "@/lib/google-calendar";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Ricava il `sub` Google (providerAccountId stabile) dal payload dell'id_token JWT. */
function subFromIdToken(idToken: string | null | undefined): string | null {
  if (!idToken) return null;
  const parts = idToken.split(".");
  if (parts.length < 2) return null;
  try {
    const json = Buffer.from(parts[1], "base64url").toString("utf8");
    const payload = JSON.parse(json) as { sub?: string };
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

/** GET /api/integrations/google/callback?code=… — scambio code → token → Account +
 *  config + calendario dedicato, poi redirect a /profilo. */
export async function GET(req: Request) {
  const backTo = (status: string) =>
    Response.redirect(new URL(`/profilo?google=${status}`, req.url));

  if (!isConfigured()) return backTo("error");
  const ctx = await currentContext();
  if (!ctx) return new Response("Unauthorized", { status: 401 });

  const code = new URL(req.url).searchParams.get("code");
  if (!code) return backTo("error");

  try {
    const redirectUri =
      new URL(req.url).origin + "/api/integrations/google/callback";
    const client = newOAuthClient(redirectUri);
    const { tokens } = await client.getToken(code);

    const providerAccountId =
      subFromIdToken(tokens.id_token) ?? `google:${ctx.user.id}`;
    await upsertGoogleAccount(ctx.user.id, providerAccountId, tokens);

    await db.googleCalendarConfig.upsert({
      where: { workspaceId: ctx.workspaceId },
      create: {
        workspaceId: ctx.workspaceId,
        calendarId: "",
        connectedByUserId: ctx.user.id,
      },
      update: { connectedByUserId: ctx.user.id },
    });

    await ensureCalendar(ctx.workspaceId);
    // Backfill: al primo collegamento spinge su Google tutti gli item già esistenti
    // (eventi, pubblicazioni, consegne). Best-effort: non deve far fallire il collegamento.
    await syncAllForWorkspace(ctx.workspaceId).catch(() => {});
    // ENTRATA: registra il push-channel di Google (Google→tool). Best-effort:
    // su localhost fallisce (URL non pubblico), in prod attiva la sync in entrata.
    await registerWatch(ctx.workspaceId).catch(() => {});
    return backTo("connected");
  } catch (err) {
    console.error("[google/callback] error", err);
    return backTo("error");
  }
}
