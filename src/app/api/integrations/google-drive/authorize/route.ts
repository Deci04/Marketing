import { currentContext } from "@/lib/current";
import { newOAuthClient, isConfigured } from "@/lib/google-calendar";
import { DRIVE_SCOPE } from "@/lib/google-drive";

export const dynamic = "force-dynamic";

/** GET /api/integrations/google-drive/authorize — consenso Google per lo scope
 *  Drive `drive.file`. L'utente deve essere loggato. */
export async function GET(req: Request) {
  if (!isConfigured())
    return new Response("Google non configurato", { status: 503 });
  const ctx = await currentContext();
  if (!ctx) return new Response("Unauthorized", { status: 401 });

  const redirectUri =
    new URL(req.url).origin + "/api/integrations/google-drive/callback";
  const client = newOAuthClient(redirectUri);
  const url = client.generateAuthUrl({
    access_type: "offline", // rilascia il refresh_token
    prompt: "consent", // forza il refresh_token anche su ri-consenso
    scope: [DRIVE_SCOPE],
  });
  return Response.redirect(url);
}
