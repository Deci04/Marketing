import webpush from "web-push";
import { db } from "@/lib/db";

let configured = false;

/** True solo se tutte e tre le env VAPID sono settate. In loro assenza il push
 *  è un no-op totale (prod resta al sicuro finché le chiavi non sono aggiunte). */
export function isPushConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY &&
    process.env.VAPID_SUBJECT
  );
}

/** Imposta i dettagli VAPID su web-push una sola volta, al primo utilizzo. */
function ensureConfigured() {
  if (configured) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  configured = true;
}

/** Invia una notifica push a tutti i device registrati di un utente. Best-effort:
 *  non lancia mai. Le subscription scadute (404/410) vengono ripulite. */
export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; url?: string }
): Promise<void> {
  if (!isPushConfigured()) return;
  try {
    ensureConfigured();
    const subs = await db.pushSubscription.findMany({ where: { userId } });
    if (subs.length === 0) return;

    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            JSON.stringify(payload)
          );
        } catch (err) {
          const statusCode = (err as { statusCode?: number })?.statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await db.pushSubscription
              .delete({ where: { endpoint: sub.endpoint } })
              .catch(() => {});
          }
        }
      })
    );
  } catch {
    // Best-effort: mai propagare.
  }
}
