import { NextResponse, type NextRequest } from "next/server";
import { currentContext } from "@/lib/current";
import { saveSocialAccount } from "@/lib/zernio";

export const dynamic = "force-dynamic";

/** GET /api/integrations/zernio/callback — ritorno dall'OAuth Zernio: legge
 *  l'account collegato dai query param, salva `SocialAccount`, torna a /profilo.
 *  Route user-driven con sessione (NON un webhook) → `currentContext()` lecito. */
export async function GET(req: NextRequest) {
  const ctx = await currentContext();
  if (!ctx) return NextResponse.redirect(new URL("/login", req.url));

  const cookie = req.cookies.get("zernio_oauth_state")?.value ?? "";
  const [, cookiePlatform] = cookie.split(":");
  const url = new URL(req.url);

  // Standard flow reale: Zernio crea il SocialAccount e reindirizza al redirect_url
  // con `?connected={platform}&profileId=X&accountId=Y&username=Z` (lo `handle-oauth-callback`
  // POST è invece la variante HEADLESS, non usata qui). `connected` è lowercase (enum
  // Zernio) → lo riportiamo UPPERCASE per coerenza col Channel enum del nostro DB.
  const accountId = url.searchParams.get("accountId") ?? "";
  const handle = url.searchParams.get("username");
  const platform = (
    url.searchParams.get("connected") ??
    cookiePlatform ??
    ""
  ).toUpperCase();

  if (!cookie || !accountId || !platform) {
    console.error("[zernio/callback] stato/param mancanti", {
      hasCookie: !!cookie,
      hasAccount: !!accountId,
      platform,
    });
    return NextResponse.redirect(new URL("/profilo?zernio=error", req.url));
  }

  try {
    await saveSocialAccount(ctx.workspaceId, {
      platform,
      zernioAccountId: accountId,
      handle,
    });
  } catch (err) {
    console.error("[zernio/callback] saveSocialAccount error", err);
    return NextResponse.redirect(new URL("/profilo?zernio=error", req.url));
  }

  const res = NextResponse.redirect(new URL("/profilo?zernio=ok", req.url));
  res.cookies.delete("zernio_oauth_state");
  return res;
}
