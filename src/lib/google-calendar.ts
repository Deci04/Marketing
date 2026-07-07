// Client Google Calendar (filone G).
// Auth: token OAuth dal modello Account (provider "google-calendar"), refresh su expires_at.
// Sync bidirezionale: USCITA (syncItemOut/deleteItemOut, idempotente su googleEventId) +
// ENTRATA (pullChanges/reconcileEvent, loop-guard: nessuna push dal path di pull).

import { google, type calendar_v3 } from "googleapis";
import type { Credentials } from "google-auth-library";
import { randomUUID } from "node:crypto";

// google.calendar()'s `auth` option expects the OAuth2Client shipped inside
// googleapis-common's nested google-auth-library, which is NOT the same
// declaration as the top-level `google-auth-library` copy (private `redirectUri`
// clashes). Deriving the type from `google.auth.OAuth2` guarantees a match.
type GoogleOAuth2Client = InstanceType<typeof google.auth.OAuth2>;
import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/workspace";
import type { BoardItemRef } from "@/lib/calendar";

export function isConfigured(): boolean {
  return !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
}

export const GOOGLE_PROVIDER = "google-calendar";
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";
const CALENDAR_SUMMARY = "Contenuti · Luca";

/** Costruisce un OAuth2 client con il redirect passato (per authorize/callback). */
export function newOAuthClient(redirectUri: string): GoogleOAuth2Client {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );
}

/** Client autenticato per un workspace: token dall'Account del connettore,
 *  refresh + ripersistenza se scaduto. null se non configurato/non collegato. */
export async function getAuthClient(
  workspaceId: string
): Promise<GoogleOAuth2Client | null> {
  if (!isConfigured()) return null;
  const cfg = await db.googleCalendarConfig.findUnique({ where: { workspaceId } });
  if (!cfg?.connectedByUserId) return null;
  const account = await db.account.findFirst({
    where: { userId: cfg.connectedByUserId, provider: GOOGLE_PROVIDER },
  });
  if (!account?.refresh_token) return null;

  const client = newOAuthClient(""); // redirect non serve per le chiamate API
  client.setCredentials({
    access_token: account.access_token ?? undefined,
    refresh_token: account.refresh_token,
    expiry_date: account.expires_at ? account.expires_at * 1000 : undefined,
  });

  const expiredSoon =
    !account.expires_at || account.expires_at * 1000 < Date.now() + 60_000;
  if (expiredSoon) {
    const { credentials } = await client.refreshAccessToken();
    client.setCredentials(credentials);
    await db.account.update({
      where: { id: account.id },
      data: {
        access_token: credentials.access_token ?? account.access_token,
        expires_at: credentials.expiry_date
          ? Math.floor(credentials.expiry_date / 1000)
          : account.expires_at,
      },
    });
  }
  return client;
}

/** Scrive/aggiorna l'Account Google del connettore (unique [provider, providerAccountId]).
 *  Il refresh_token viene aggiornato solo se Google lo rilascia (non arriva su ogni consenso). */
export async function upsertGoogleAccount(
  userId: string,
  providerAccountId: string,
  tokens: Credentials
): Promise<void> {
  const expires_at = tokens.expiry_date
    ? Math.floor(tokens.expiry_date / 1000)
    : null;
  await db.account.upsert({
    where: {
      provider_providerAccountId: {
        provider: GOOGLE_PROVIDER,
        providerAccountId,
      },
    },
    create: {
      userId,
      type: "oauth",
      provider: GOOGLE_PROVIDER,
      providerAccountId,
      access_token: tokens.access_token ?? null,
      refresh_token: tokens.refresh_token ?? null,
      expires_at,
      scope: tokens.scope ?? null,
      token_type: tokens.token_type ?? null,
      id_token: tokens.id_token ?? null,
    },
    update: {
      userId,
      access_token: tokens.access_token ?? null,
      expires_at,
      scope: tokens.scope ?? null,
      token_type: tokens.token_type ?? null,
      id_token: tokens.id_token ?? null,
      ...(tokens.refresh_token ? { refresh_token: tokens.refresh_token } : {}),
    },
  });
}

// --- Tag responsabile + builder event-resource all-day (funzioni PURE) ---

export type Responsible = "LUCA" | "MATTEO" | null;
const TAG: Record<"LUCA" | "MATTEO", string> = {
  LUCA: "[Luca]",
  MATTEO: "[Matteo]",
};
// Google colorId: 11 = tomato (Luca), 9 = blueberry (Matteo). Vedi Colors.get.
const COLOR: Record<"LUCA" | "MATTEO", string> = { LUCA: "11", MATTEO: "9" };

export function encodeTitle(label: string, responsible: Responsible): string {
  return responsible ? `${TAG[responsible]} ${label}` : label;
}

export function parseTitle(title: string): {
  label: string;
  responsible: Responsible;
} {
  const m = title.match(/^\[(Luca|Matteo)\]\s*([\s\S]*)$/);
  if (!m) return { label: title, responsible: null };
  return { label: m[2], responsible: m[1] === "Luca" ? "LUCA" : "MATTEO" };
}

export function colorIdFor(responsible: Responsible): string | undefined {
  return responsible ? COLOR[responsible] : undefined;
}

export function toAllDayDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
/** Pinna una Date al giorno-di-calendario UTC a mezzanotte, così una data non a
 *  mezzanotte-UTC non introduce off-by-one quando la si converte in all-day. */
export function toUtcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
export function fromAllDayDate(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

export function buildEventResource(input: {
  label: string;
  date: Date;
  responsible: Responsible;
  refType: BoardItemRef;
  refId: string;
}): calendar_v3.Schema$Event {
  const date = toUtcMidnight(input.date); // guardia off-by-one se non mezzanotte-UTC
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + 1);
  return {
    summary: encodeTitle(input.label, input.responsible),
    start: { date: toAllDayDate(date) },
    end: { date: toAllDayDate(next) }, // end esclusivo (= giorno + 1)
    colorId: colorIdFor(input.responsible),
    extendedProperties: {
      private: {
        responsible: input.responsible ?? "",
        refType: input.refType,
        refId: input.refId,
      },
    },
  };
}

// --- USCITA: ensureCalendar + syncItemOut / deleteItemOut (idempotente) ---

/** calendarId del calendario dedicato; lo crea se manca. null se non autenticato. */
export async function ensureCalendar(
  workspaceId: string
): Promise<string | null> {
  const auth = await getAuthClient(workspaceId);
  if (!auth) return null;
  const cfg = await db.googleCalendarConfig.findUnique({ where: { workspaceId } });
  if (cfg?.calendarId) return cfg.calendarId;
  const cal = google.calendar({ version: "v3", auth });
  const res = await cal.calendars.insert({
    requestBody: { summary: CALENDAR_SUMMARY, timeZone: "Europe/Rome" },
  });
  const calendarId = res.data.id;
  if (!calendarId) return null;
  await db.googleCalendarConfig.upsert({
    where: { workspaceId },
    create: { workspaceId, calendarId },
    update: { calendarId },
  });
  return calendarId;
}

type ResolvedItem = { label: string; date: Date; responsible: Responsible };

/** Legge Block/Content/CalendarEvent e ne deriva label/date/responsabile.
 *  Ritorna null se l'entità non esiste o non ha una data (niente da sincronizzare). */
export async function resolveItem(
  workspaceId: string,
  refType: BoardItemRef,
  refId: string
): Promise<ResolvedItem | null> {
  if (refType === "luca" || refType === "matteo") {
    const b = await db.block.findFirst({
      where: scopedWhere(workspaceId, { id: refId }),
    });
    if (!b) return null;
    const date = refType === "luca" ? b.lucaDeliveryAt : b.matteoDeliveryAt;
    if (!date) return null;
    const who = refType === "luca" ? "Luca" : "Matteo";
    return {
      label: `${who} · ${b.label}`,
      date,
      responsible: refType === "luca" ? "LUCA" : "MATTEO",
    };
  }
  if (refType === "publication") {
    const c = await db.content.findFirst({
      where: scopedWhere(workspaceId, { id: refId }),
    });
    if (!c?.publishAt) return null;
    return { label: c.title, date: c.publishAt, responsible: "MATTEO" };
  }
  const e = await db.calendarEvent.findFirst({
    where: scopedWhere(workspaceId, { id: refId }),
  });
  if (!e?.date) return null;
  const responsible: Responsible =
    e.responsible === "LUCA" ? "LUCA" : e.responsible === "MATTEO" ? "MATTEO" : null;
  return { label: e.title, date: e.date, responsible };
}

/** Codice HTTP normalizzato: in googleapis/Gaxios lo status può essere stringa
 *  (`err.response.status`) o numero (`err.code`). Numerizza per confronti robusti. */
function errCode(err: unknown): number {
  return Number(
    (err as { response?: { status?: number } })?.response?.status ??
      (err as { code?: number })?.code
  );
}

/** true se l'evento è mancante (404/410) o in conflitto etag (412). */
function isMissingOrConflict(err: unknown): boolean {
  const code = errCode(err);
  return code === 404 || code === 410 || code === 412;
}

/** USCITA idempotente: patch se esiste già il link (con etag/If-Match). Su 404/410
 *  (evento cancellato su Google) ricrea con insert; su 412 (etag stale = conflitto)
 *  re-patch senza If-Match (last-write-wins). Altrimenti insert. Upsert del link.
 *  Degrada in silenzio. Fire-and-forget dai chokepoint. */
export async function syncItemOut(
  workspaceId: string,
  refType: BoardItemRef,
  refId: string
): Promise<void> {
  try {
    const auth = await getAuthClient(workspaceId);
    if (!auth) return;
    const calendarId = await ensureCalendar(workspaceId);
    if (!calendarId) return;
    const item = await resolveItem(workspaceId, refType, refId);
    if (!item) return;

    const cal = google.calendar({ version: "v3", auth });
    const body = buildEventResource({
      label: item.label,
      date: item.date,
      responsible: item.responsible,
      refType,
      refId,
    });
    const link = await db.googleCalendarLink.findUnique({
      where: { workspaceId_refType_refId: { workspaceId, refType, refId } },
    });

    let googleEventId: string | undefined;
    let etag: string | undefined;
    let calId = calendarId;

    if (link?.googleEventId) {
      calId = link.googleCalendarId || calendarId;
      try {
        const res = await cal.events.patch({
          calendarId: calId,
          eventId: link.googleEventId,
          requestBody: body,
          ...(link.etag ? { headers: { "If-Match": link.etag } } : {}),
        });
        googleEventId = res.data.id ?? link.googleEventId;
        etag = res.data.etag ?? undefined;
      } catch (err) {
        const code = errCode(err);
        if (code === 404 || code === 410) {
          // Evento cancellato su Google → ricrea con insert.
          const res = await cal.events.insert({ calendarId, requestBody: body });
          googleEventId = res.data.id ?? undefined;
          etag = res.data.etag ?? undefined;
          calId = calendarId;
        } else if (code === 412) {
          // Etag stale = conflitto → re-patch SENZA If-Match (last-write-wins:
          // il tool vince e sovrascrive). NON insert, così non si duplica/orfana.
          const res = await cal.events.patch({
            calendarId: calId,
            eventId: link.googleEventId,
            requestBody: body,
          });
          googleEventId = res.data.id ?? link.googleEventId;
          etag = res.data.etag ?? undefined;
        } else {
          throw err;
        }
      }
    } else {
      const res = await cal.events.insert({ calendarId, requestBody: body });
      googleEventId = res.data.id ?? undefined;
      etag = res.data.etag ?? undefined;
    }

    if (!googleEventId) return;
    await db.googleCalendarLink.upsert({
      where: { workspaceId_refType_refId: { workspaceId, refType, refId } },
      create: {
        workspaceId,
        refType,
        refId,
        googleEventId,
        googleCalendarId: calId,
        etag: etag ?? null,
        lastSyncedAt: new Date(),
        syncStatus: "SYNCED",
      },
      update: {
        googleEventId,
        googleCalendarId: calId,
        etag: etag ?? null,
        lastSyncedAt: new Date(),
        syncStatus: "SYNCED",
      },
    });
  } catch {
    // fire-and-forget: nessun errore propagato ai chokepoint.
  }
}

/** USCITA: cancella l'evento su Google (ingoia 404/410) e rimuove il link. Silenzioso. */
export async function deleteItemOut(
  workspaceId: string,
  refType: BoardItemRef,
  refId: string
): Promise<void> {
  try {
    const link = await db.googleCalendarLink.findUnique({
      where: { workspaceId_refType_refId: { workspaceId, refType, refId } },
    });
    if (!link) return;
    const auth = await getAuthClient(workspaceId);
    if (auth) {
      const cal = google.calendar({ version: "v3", auth });
      try {
        await cal.events.delete({
          calendarId: link.googleCalendarId,
          eventId: link.googleEventId,
        });
      } catch (err) {
        if (!isMissingOrConflict(err)) throw err; // già-cancellato: ok
      }
    }
    await db.googleCalendarLink.delete({ where: { id: link.id } });
  } catch {
    // fire-and-forget
  }
}

// --- ENTRATA: pullChanges + reconcileEvent (loop-guard: nessuna push) ---

/** Esiste ancora l'entità di dominio referenziata? (per adottare eventi
 *  self-originated senza duplicare — vedi race webhook↔sync in reconcileEvent). */
async function entityExists(
  workspaceId: string,
  refType: BoardItemRef,
  refId: string
): Promise<boolean> {
  if (refType === "luca" || refType === "matteo") {
    return !!(await db.block.findFirst({
      where: scopedWhere(workspaceId, { id: refId }),
    }));
  }
  if (refType === "publication") {
    return !!(await db.content.findFirst({
      where: scopedWhere(workspaceId, { id: refId }),
    }));
  }
  return !!(await db.calendarEvent.findFirst({
    where: scopedWhere(workspaceId, { id: refId }),
  }));
}

/** Riconcilia un singolo evento Google → DB. Dedup su googleEventId. NON richiama
 *  syncItemOut (loop-guard). */
async function reconcileEvent(
  workspaceId: string,
  calendarId: string,
  ev: calendar_v3.Schema$Event
): Promise<void> {
  const gid = ev.id;
  if (!gid) return;
  const link = await db.googleCalendarLink.findFirst({
    where: scopedWhere(workspaceId, { googleEventId: gid }),
  });

  // Evento cancellato su Google → rimuove l'entità (o azzera la data) + il link.
  if (ev.status === "cancelled") {
    if (!link) return;
    try {
      if (link.refType === "event") {
        await db.calendarEvent.delete({ where: { id: link.refId } });
      } else if (link.refType === "publication") {
        await db.content.update({
          where: { id: link.refId },
          data: { publishAt: null },
        });
      } else if (link.refType === "luca") {
        await db.block.update({
          where: { id: link.refId },
          data: { lucaDeliveryAt: null },
        });
      } else if (link.refType === "matteo") {
        await db.block.update({
          where: { id: link.refId },
          data: { matteoDeliveryAt: null },
        });
      }
    } catch {
      // entità già rimossa: prosegui a cancellare il link
    }
    await db.googleCalendarLink.delete({ where: { id: link.id } });
    return;
  }

  const dateStr =
    ev.start?.date ??
    (ev.start?.dateTime ? ev.start.dateTime.slice(0, 10) : null);
  const date = dateStr ? fromAllDayDate(dateStr) : null;
  const { label, responsible } = parseTitle(ev.summary ?? "");

  if (link) {
    if (date) {
      if (link.refType === "publication") {
        await db.content.update({
          where: { id: link.refId },
          data: { publishAt: date },
        });
      } else if (link.refType === "luca") {
        await db.block.update({
          where: { id: link.refId },
          data: { lucaDeliveryAt: date },
        });
      } else if (link.refType === "matteo") {
        await db.block.update({
          where: { id: link.refId },
          data: { matteoDeliveryAt: date },
        });
      } else if (link.refType === "event") {
        await db.calendarEvent.update({
          where: { id: link.refId },
          data: { date, title: label, responsible },
        });
      }
    }
    await db.googleCalendarLink.update({
      where: { id: link.id },
      data: {
        etag: ev.etag ?? link.etag,
        lastSyncedAt: new Date(),
        syncStatus: "SYNCED",
      },
    });
    return;
  }

  // Race webhook↔sync: un evento self-originated (creato dal nostro syncItemOut,
  // che scrive refType/refId in extendedProperties.private) può arrivare dal pull
  // PRIMA che il link sia committato. In tal caso NON creare un CalendarEvent
  // spurio: riconcilia sull'entità esistente facendo l'upsert del link.
  const priv = ev.extendedProperties?.private ?? undefined;
  const selfRefType = priv?.refType as BoardItemRef | undefined;
  const selfRefId = priv?.refId ?? undefined;
  if (
    selfRefType &&
    selfRefId &&
    (await entityExists(workspaceId, selfRefType, selfRefId))
  ) {
    await db.googleCalendarLink.upsert({
      where: {
        workspaceId_refType_refId: {
          workspaceId,
          refType: selfRefType,
          refId: selfRefId,
        },
      },
      create: {
        workspaceId,
        refType: selfRefType,
        refId: selfRefId,
        googleEventId: gid,
        googleCalendarId: calendarId,
        etag: ev.etag ?? null,
        lastSyncedAt: new Date(),
        syncStatus: "SYNCED",
      },
      update: {
        googleEventId: gid,
        googleCalendarId: calendarId,
        etag: ev.etag ?? null,
        lastSyncedAt: new Date(),
        syncStatus: "SYNCED",
      },
    });
    return;
  }

  // Evento nuovo su Google (nessun link) → crea un CalendarEvent + il link event.
  if (!date) return;
  const created = await db.calendarEvent.create({
    data: { workspaceId, date, title: label, responsible },
  });
  await db.googleCalendarLink.create({
    data: {
      workspaceId,
      refType: "event",
      refId: created.id,
      googleEventId: gid,
      googleCalendarId: calendarId,
      etag: ev.etag ?? null,
      lastSyncedAt: new Date(),
      syncStatus: "SYNCED",
    },
  });
}

/** BACKFILL: spinge su Google TUTTI gli item del board già esistenti nel workspace
 *  (eventi, pubblicazioni programmate, consegne dei blocchi). Idempotente perché
 *  syncItemOut fa insert-o-patch sulla mappa GoogleCalendarLink. Ritorna il numero
 *  di item sincronizzati. Da chiamare al primo collegamento o dal bottone "Sincronizza tutto". */
export async function syncAllForWorkspace(workspaceId: string): Promise<number> {
  if (!isConfigured()) return 0;
  const [events, contents, blocks] = await Promise.all([
    db.calendarEvent.findMany({ where: scopedWhere(workspaceId), select: { id: true } }),
    db.content.findMany({
      where: scopedWhere(workspaceId, { publishAt: { not: null } }),
      select: { id: true },
    }),
    db.block.findMany({
      where: scopedWhere(workspaceId),
      select: { id: true, lucaDeliveryAt: true, matteoDeliveryAt: true },
    }),
  ]);
  let n = 0;
  for (const e of events) {
    await syncItemOut(workspaceId, "event", e.id);
    n++;
  }
  for (const c of contents) {
    await syncItemOut(workspaceId, "publication", c.id);
    n++;
  }
  for (const b of blocks) {
    if (b.lucaDeliveryAt) {
      await syncItemOut(workspaceId, "luca", b.id);
      n++;
    }
    if (b.matteoDeliveryAt) {
      await syncItemOut(workspaceId, "matteo", b.id);
      n++;
    }
  }
  return n;
}

/** ENTRATA: pull incrementale via syncToken. Primo giro senza token = full sync;
 *  salva nextSyncToken. Su 410 (token scaduto) azzera e rifà full sync. Silenzioso. */
export async function pullChanges(workspaceId: string): Promise<void> {
  try {
    const auth = await getAuthClient(workspaceId);
    if (!auth) return;
    const cfg = await db.googleCalendarConfig.findUnique({
      where: { workspaceId },
    });
    if (!cfg?.calendarId) return;
    const calendarId = cfg.calendarId;
    const cal = google.calendar({ version: "v3", auth });

    let syncToken: string | undefined = cfg.syncToken ?? undefined;
    let pageToken: string | undefined;
    let nextSyncToken: string | undefined;
    let didFullResync = false;

    do {
      let res: { data: calendar_v3.Schema$Events };
      try {
        res = await cal.events.list({
          calendarId,
          syncToken,
          pageToken,
          showDeleted: true,
          singleEvents: true,
        });
      } catch (err) {
        const code = errCode(err);
        if (code === 410 && !didFullResync) {
          // syncToken scaduto → full resync una sola volta.
          didFullResync = true;
          syncToken = undefined;
          pageToken = undefined;
          await db.googleCalendarConfig.update({
            where: { workspaceId },
            data: { syncToken: null },
          });
          continue;
        }
        throw err;
      }

      const items = res.data.items ?? [];
      for (const ev of items) {
        await reconcileEvent(workspaceId, calendarId, ev);
      }
      pageToken = res.data.nextPageToken ?? undefined;
      if (res.data.nextSyncToken) nextSyncToken = res.data.nextSyncToken;
    } while (pageToken);

    if (nextSyncToken) {
      await db.googleCalendarConfig.update({
        where: { workspaceId },
        data: { syncToken: nextSyncToken },
      });
    }
  } catch {
    // silenzioso
  }
}

// --- ENTRATA: watch-channel (registrazione push) ---

/** Registra un push channel su Google → notifiche al webhook. baseUrl da env
 *  (NEXT_PUBLIC_APP_URL / NEXTAUTH_URL). Degrada se assente. Solo prod HTTPS. */
export async function registerWatch(workspaceId: string): Promise<void> {
  try {
    const auth = await getAuthClient(workspaceId);
    if (!auth) return;
    const calendarId = await ensureCalendar(workspaceId);
    if (!calendarId) return;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL;
    if (!baseUrl) return;
    const cal = google.calendar({ version: "v3", auth });
    const channelId = randomUUID();
    const res = await cal.events.watch({
      calendarId,
      requestBody: {
        id: channelId,
        type: "web_hook",
        address: `${baseUrl}/api/integrations/google/webhook`,
        ...(process.env.GOOGLE_WEBHOOK_TOKEN
          ? { token: process.env.GOOGLE_WEBHOOK_TOKEN }
          : {}),
      },
    });
    await db.googleCalendarConfig.update({
      where: { workspaceId },
      data: {
        channelId,
        resourceId: res.data.resourceId ?? null,
        watchExpiration: res.data.expiration
          ? new Date(Number(res.data.expiration))
          : null,
      },
    });
  } catch {
    // silenzioso
  }
}

/** Ferma il push channel attivo (channels.stop). Silenzioso. */
export async function stopWatch(workspaceId: string): Promise<void> {
  try {
    const auth = await getAuthClient(workspaceId);
    if (!auth) return;
    const cfg = await db.googleCalendarConfig.findUnique({
      where: { workspaceId },
    });
    if (!cfg?.channelId || !cfg?.resourceId) return;
    const cal = google.calendar({ version: "v3", auth });
    await cal.channels.stop({
      requestBody: { id: cfg.channelId, resourceId: cfg.resourceId },
    });
    await db.googleCalendarConfig.update({
      where: { workspaceId },
      data: { channelId: null, resourceId: null, watchExpiration: null },
    });
  } catch {
    // silenzioso
  }
}
