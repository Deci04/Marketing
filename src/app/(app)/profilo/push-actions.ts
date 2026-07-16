"use server";

import { db } from "@/lib/db";
import { currentUser } from "@/lib/current";

/** Registra (o aggiorna) una push subscription per l'utente corrente. */
export async function subscribePushAction(sub: {
  endpoint: string;
  p256dh: string;
  auth: string;
}) {
  const u = await currentUser();
  if (!u) throw new Error("Non autorizzato");
  if (!sub.endpoint || !sub.p256dh || !sub.auth) return;

  await db.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    update: { userId: u.id, p256dh: sub.p256dh, auth: sub.auth },
    create: {
      userId: u.id,
      endpoint: sub.endpoint,
      p256dh: sub.p256dh,
      auth: sub.auth,
    },
  });
}

/** Rimuove una push subscription (scoped all'utente corrente). */
export async function unsubscribePushAction(endpoint: string) {
  const u = await currentUser();
  if (!u) throw new Error("Non autorizzato");
  if (!endpoint) return;

  await db.pushSubscription.deleteMany({
    where: { endpoint, userId: u.id },
  });
}
