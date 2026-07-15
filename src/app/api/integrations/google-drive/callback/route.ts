import { currentContext } from "@/lib/current";
import { newOAuthClient, isConfigured } from "@/lib/google-calendar";
import { saveDriveTokens } from "@/lib/google-drive";

export const dynamic = "force-dynamic";

/** GET /api/integrations/google-drive/callback?code=… — scambio code → token →
 *  salva il refresh_token Drive, poi redirect a /profilo. */
export async function GET(req: Request) {
  const backTo = (status: string) =>
    Response.redirect(new URL(`/profilo?drive=${status}`, req.url));

  if (!isConfigured()) return backTo("error");
  const ctx = await currentContext();
  if (!ctx) return new Response("Unauthorized", { status: 401 });

  const code = new URL(req.url).searchParams.get("code");
  if (!code) return backTo("error");

  try {
    const redirectUri =
      new URL(req.url).origin + "/api/integrations/google-drive/callback";
    const client = newOAuthClient(redirectUri);
    const { tokens } = await client.getToken(code);
    await saveDriveTokens(ctx.user.id, tokens);
    return backTo("connected");
  } catch {
    return backTo("error");
  }
}
