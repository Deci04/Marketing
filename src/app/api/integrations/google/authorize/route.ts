import { currentContext } from "@/lib/current";
import {
  newOAuthClient,
  CALENDAR_SCOPE,
  isConfigured,
} from "@/lib/google-calendar";

export const dynamic = "force-dynamic";

/** GET /api/integrations/google/authorize — redirect al consenso Google.
 *  L'utente DEVE essere loggato (queste route hanno sessione, a differenza del webhook). */
export async function GET(req: Request) {
  if (!isConfigured()) {
    return new Response("Google non configurato", { status: 503 });
  }
  const ctx = await currentContext();
  if (!ctx) return new Response("Unauthorized", { status: 401 });

  const redirectUri =
    new URL(req.url).origin + "/api/integrations/google/callback";
  const client = newOAuthClient(redirectUri);
  const url = client.generateAuthUrl({
    access_type: "offline", // rilascia il refresh_token
    prompt: "consent", // forza il refresh_token anche su ri-consenso
    scope: [CALENDAR_SCOPE],
  });
  return Response.redirect(url);
}
