import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/workspace";
import { chatIdForUser } from "@/lib/telegram-link";
import { sendMessage } from "@/lib/telegram";
import { isPushConfigured, sendPushToUser } from "@/lib/web-push";
import type { ActivityType } from "@prisma/client";

export async function createActivity(
  workspaceId: string,
  data: { type: ActivityType; contentId?: string | null; actorId?: string | null }
) {
  const activity = await db.activity.create({
    data: {
      workspaceId,
      type: data.type,
      contentId: data.contentId ?? null,
      actorId: data.actorId ?? null,
    },
  });
  // Hook notifiche esterne — acceso dal filone N. No-op finché non implementato.
  await notifyTelegramForActivity(activity).catch(() => {});
  // Push notifiche browser/device (PWA parte B). No-op se VAPID non è configurata.
  await notifyWebPushForActivity(activity).catch(() => {});
  return activity;
}

/** Tipi che generano una notifica push Telegram (gli altri restano solo in campanella). */
const PUSH_TYPES: ReadonlySet<ActivityType> = new Set<ActivityType>([
  "DELIVERED",
  "REVIEW_READY",
  "CONFIRMED",
  "COMMENT",
]);

/** Escape minimale per il parse_mode HTML di Telegram. */
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Compone il testo italiano della notifica. `title`/`actor` già presenti = arricchiscono il messaggio. */
function composeText(
  type: ActivityType,
  actor: string | null,
  title: string | null,
  link: string | null
): string {
  const who = actor ? esc(actor) : "Qualcuno";
  const forTitle = title ? ` per «${esc(title)}»` : "";
  const ofTitle = title ? ` di «${esc(title)}»` : "";
  const onTitle = title ? ` «${esc(title)}»` : "";
  let body: string;
  switch (type) {
    case "DELIVERED":
      body = `🎬 ${who} ha consegnato il materiale${forTitle}`;
      break;
    case "REVIEW_READY":
      body = `✅ ${who} ha caricato il montato${ofTitle} — da confermare`;
      break;
    case "CONFIRMED":
      body = `👍 ${who} ha confermato${onTitle}`;
      break;
    case "COMMENT":
      body = `💬 ${who} ha commentato${onTitle}`;
      break;
    default:
      body = `🔔 Aggiornamento${onTitle}`;
  }
  return link ? `${body}\n${link}` : body;
}

/** Link al contenuto: URL assoluto se NEXT_PUBLIC_APP_URL è settata, altrimenti path relativo. */
function contentLink(contentId: string | null): string | null {
  if (!contentId) return null;
  const path = `/contenuti/${contentId}`;
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "");
  return base ? `${base}${path}` : path;
}

/**
 * Filone N: dopo ogni createActivity, notifica via Telegram i membri del workspace
 * diversi dall'actor che hanno una chat collegata. Best-effort: non lancia mai.
 */
export async function notifyTelegramForActivity(activity: {
  workspaceId: string;
  type: ActivityType;
  contentId: string | null;
  actorId: string | null;
}): Promise<void> {
  try {
    if (!PUSH_TYPES.has(activity.type)) return;

    // Destinatari: membri del workspace diversi dall'actor.
    const memberships = await db.membership.findMany({
      where: scopedWhere(
        activity.workspaceId,
        activity.actorId ? { userId: { not: activity.actorId } } : {}
      ),
      select: { userId: true },
    });
    if (memberships.length === 0) return;

    // Arricchimenti opzionali: nome dell'actor e titolo del contenuto.
    const [actor, content] = await Promise.all([
      activity.actorId
        ? db.user
            .findUnique({
              where: { id: activity.actorId },
              select: { name: true, email: true },
            })
            .catch(() => null)
        : Promise.resolve(null),
      activity.contentId
        ? db.content
            .findFirst({
              where: scopedWhere(activity.workspaceId, { id: activity.contentId }),
              select: { title: true },
            })
            .catch(() => null)
        : Promise.resolve(null),
    ]);

    const actorName = actor?.name ?? actor?.email ?? null;
    const title = content?.title ?? null;
    const link = contentLink(activity.contentId);
    const text = composeText(activity.type, actorName, title, link);

    await Promise.all(
      memberships.map(async (m) => {
        const chatId = await chatIdForUser(m.userId).catch(() => null);
        if (!chatId) return; // destinatario senza Telegram → no-op naturale
        await sendMessage(chatId, text).catch(() => {});
      })
    );
  } catch {
    // Notifica interamente best-effort: non deve mai far fallire createActivity.
  }
}

/** Titolo breve per la notifica push (il corpo lo fa già composeText). */
function shortTitleFor(type: ActivityType): string {
  switch (type) {
    case "DELIVERED":
      return "Materiale consegnato";
    case "REVIEW_READY":
      return "Montato da confermare";
    case "CONFIRMED":
      return "Contenuto confermato";
    case "COMMENT":
      return "Nuovo commento";
    default:
      return "Gestione contenuti";
  }
}

/**
 * Filone PWA-B: dopo ogni createActivity, notifica via push (device/browser) i
 * membri del workspace diversi dall'actor. Stessa logica destinatari/testo del
 * filone N (Telegram). Best-effort e no-op totale se VAPID non è configurata.
 */
export async function notifyWebPushForActivity(activity: {
  workspaceId: string;
  type: ActivityType;
  contentId: string | null;
  actorId: string | null;
}): Promise<void> {
  if (!isPushConfigured()) return;
  try {
    if (!PUSH_TYPES.has(activity.type)) return;

    // Destinatari: membri del workspace diversi dall'actor.
    const memberships = await db.membership.findMany({
      where: scopedWhere(
        activity.workspaceId,
        activity.actorId ? { userId: { not: activity.actorId } } : {}
      ),
      select: { userId: true },
    });
    if (memberships.length === 0) return;

    // Arricchimenti opzionali: nome dell'actor e titolo del contenuto.
    const [actor, content] = await Promise.all([
      activity.actorId
        ? db.user
            .findUnique({
              where: { id: activity.actorId },
              select: { name: true, email: true },
            })
            .catch(() => null)
        : Promise.resolve(null),
      activity.contentId
        ? db.content
            .findFirst({
              where: scopedWhere(activity.workspaceId, { id: activity.contentId }),
              select: { title: true },
            })
            .catch(() => null)
        : Promise.resolve(null),
    ]);

    const actorName = actor?.name ?? actor?.email ?? null;
    const title = content?.title ?? null;
    const link = contentLink(activity.contentId);
    const body = composeText(activity.type, actorName, title, link);
    const pushTitle = shortTitleFor(activity.type);

    await Promise.all(
      memberships.map((m) =>
        sendPushToUser(m.userId, {
          title: pushTitle,
          body,
          url: link ?? undefined,
        }).catch(() => {})
      )
    );
  } catch {
    // Notifica interamente best-effort: non deve mai far fallire createActivity.
  }
}

export async function listActivity(workspaceId: string, limit = 20) {
  return db.activity.findMany({
    where: scopedWhere(workspaceId),
    include: { content: { select: { id: true, title: true, channel: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/** Unread = activities by *other* users since the viewer last opened the feed. */
export async function unreadCount(
  workspaceId: string,
  userId: string,
  seenAt: Date | null
) {
  return db.activity.count({
    where: {
      ...scopedWhere(workspaceId),
      actorId: { not: userId },
      ...(seenAt ? { createdAt: { gt: seenAt } } : {}),
    },
  });
}
