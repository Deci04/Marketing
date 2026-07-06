import { NextResponse, type NextRequest } from "next/server";
import { currentContext } from "@/lib/current";
import { getConnectUrl, isConfigured } from "@/lib/zernio";

export const dynamic = "force-dynamic";

/** GET /api/integrations/zernio/connect/{platform} — avvia l'OAuth Zernio per
 *  collegare un account social. Route user-driven con sessione (NON un webhook),
 *  quindi `currentContext()` è lecito. `state` in cookie httpOnly per CSRF. */
export async function GET(
  req: NextRequest,
  ctx: RouteContext<"/api/integrations/zernio/connect/[platform]">
) {
  const context = await currentContext();
  if (!context) return NextResponse.redirect(new URL("/login", req.url));
  if (!isConfigured())
    return NextResponse.redirect(new URL("/profilo?zernio=nonconfig", req.url));

  const { platform } = await ctx.params;
  const state = crypto.randomUUID();
  // Redirect URI coerente con quello che la callback si aspetta.
  const redirectUri = new URL(
    "/api/integrations/zernio/callback",
    req.url
  ).toString();
  const authUrl = await getConnectUrl(platform, redirectUri);

  const res = NextResponse.redirect(authUrl);
  res.cookies.set("zernio_oauth_state", `${state}:${platform}`, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
