// Client Zernio — skeleton (filone Z: ingestione KPI · filone W: pubblicazione).
// Base: https://zernio.com/api/v1 · auth: Authorization: Bearer $ZERNIO_API_KEY
import type { Channel } from "@prisma/client";
import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/workspace";
import { INSIGHT_KEYS, type InsightKey } from "@/lib/metric-keys";

export const ZERNIO_BASE = "https://zernio.com/api/v1";
const key = () => process.env.ZERNIO_API_KEY ?? "";

export function isConfigured(): boolean {
  return !!key();
}

/** Fetch autenticato verso Zernio. Degrada solo se non configurato (chiamanti fanno la guard). */
export async function zernioFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${ZERNIO_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key()}`,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Zernio ${res.status} ${path}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

// --- Tipi normalizzati consumati da ingestAnalytics/mapper ---
// NB: questi NON sono 1:1 con una singola risposta Zernio: `fetchAnalytics`
// aggrega più endpoint reali (/accounts/follower-stats, /analytics/daily-metrics,
// /analytics/instagram/account-insights, /analytics/instagram/demographics,
// /analytics) in questa forma comoda per l'ingest.
export type ZernioAccountMetrics = {
  date: string; // "YYYY-MM-DD" (giorno UTC)
  followers: number | null;
  /**
   * ENGAGEMENT RATE IN PERCENTUALE (0..100). Zernio NON espone un ER account/giorno:
   * lo deriviamo da /analytics/daily-metrics come (likes+comments+shares+saves)/reach*100.
   * Il chart kpi-chart.tsx lo mostra come `${v}%`, quindi va in percentuale (già ×100).
   */
  engagementRate: number | null;
  /** % di reach da non-follower (0..100), da account-insights breakdown follower_type. */
  nonFollowerPct: number | null;
};
export type ZernioDemographic = {
  dimension:
    | "age" | "gender" | "geo" | "followerType" | "activity" | "returning"
    | "city" | "age_engaged" | "gender_engaged";
  label: string;
  value: number;
};
// Shape reale del blocco `analytics` per-post di GET /v1/analytics (list & single).
export type ZernioPostMetrics = {
  externalId: string;
  impressions: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  saves: number | null;
  shares: number | null;
  clicks: number | null;
  views: number | null;
  /** ER per-post in PERCENTUALE (0..100) come da Zernio; non scritto su Content (l'ER è ricalcolato in kpi.ts). */
  engagementRate: number | null;
};
export type ZernioAnalytics = {
  account: ZernioAccountMetrics[];
  demographics: ZernioDemographic[];
  posts: ZernioPostMetrics[];
};

// --- Shape GREZZE reali degli endpoint Zernio (ricavate dalla spec OpenAPI) ---
type ZernioProfileRef = string | { _id?: string; name?: string; slug?: string };
type ZernioApiAccount = {
  _id: string;
  platform: string;
  profileId?: ZernioProfileRef;
  username?: string;
  displayName?: string;
};
// GET /v1/accounts → { accounts, hasAnalyticsAccess }
type ZernioAccountsListResponse = {
  accounts: ZernioApiAccount[];
  hasAnalyticsAccess?: boolean;
};
// Forma estesa del singolo account (profilo/token) usata da fetchAccountProfile.
type ZernioApiAccountFull = ZernioApiAccount & {
  tokenExpiresAt?: string;
  metadata?: { profileData?: { extraData?: { followsCount?: number; mediaCount?: number } } };
};
// GET /v1/accounts/follower-stats → { stats: { <accountId>: [{date, followers}] } }
type ZernioFollowerStatsResponse = {
  stats?: Record<string, { date: string; followers: number }[]>;
};
// GET /v1/analytics/daily-metrics → { dailyData: [{date, metrics:{...}}], platformBreakdown }
type ZernioDailyMetricsResponse = {
  dailyData?: {
    date: string;
    metrics?: {
      impressions?: number;
      reach?: number;
      likes?: number;
      comments?: number;
      shares?: number;
      saves?: number;
      clicks?: number;
      views?: number;
    };
  }[];
};
// Envelope condiviso account-insights: metrics[<name>] = { total, values[], breakdowns[] }
type ZernioMetricBlock = {
  total?: number;
  values?: { date: string; value: number }[];
  breakdowns?: { dimension: string; value: number }[];
};
// GET /v1/analytics/instagram/account-insights
type ZernioAccountInsightsResponse = { metrics?: Record<string, ZernioMetricBlock> };
// GET /v1/analytics/instagram/demographics → { demographics: { age:[{dimension,value}], gender, city, country } }
type ZernioDemographicsResponse = {
  demographics?: Record<string, { dimension: string; value: number }[]>;
};
// GET /v1/analytics (list) → { overview, posts:[{_id, latePostId, analytics}], pagination, accounts }
type ZernioAnalyticsListResponse = {
  posts?: {
    _id?: string;
    latePostId?: string | null;
    platform?: string;
    analytics?: {
      impressions?: number;
      reach?: number;
      likes?: number;
      comments?: number;
      shares?: number;
      saves?: number;
      clicks?: number;
      views?: number;
      engagementRate?: number;
    } | null;
  }[];
};

const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
const toYmd = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * Aggrega gli endpoint analytics REALI di Zernio nella forma `ZernioAnalytics`.
 * - account/giorno: /accounts/follower-stats (followers) + /analytics/daily-metrics
 *   (engagement_rate derivato, in %) + /analytics/instagram/account-insights
 *   (non_follower_pct dal breakdown follower_type).
 * - demografiche: /analytics/instagram/demographics.
 * - per-post: /analytics (list paginata).
 * `profileId` è mantenuto per compat col chiamante (che passa il SocialAccount id
 * salvato al connect): quando `accountId` manca, è usato come Zernio account id.
 * Ogni sezione degrada a vuoto in caso di errore (es. platform non-IG, add-on assente).
 */
export async function fetchAnalytics(params: {
  profileId?: string;
  accountId?: string;
  platform?: string;
  from?: Date;
  to?: Date;
}): Promise<ZernioAnalytics> {
  const accountId = params.accountId ?? params.profileId ?? "";
  const platform = params.platform?.toLowerCase();
  const to = params.to ?? new Date();
  const from = params.from ?? new Date(to.getTime() - 90 * 86_400_000);
  const fromYmd = toYmd(from);
  const toYmdStr = toYmd(to);

  const [account, demographics, posts] = await Promise.all([
    fetchAccountMetrics(accountId, platform, fromYmd, toYmdStr),
    fetchDemographics(accountId, platform),
    fetchPostMetrics(accountId, platform, fromYmd, toYmdStr),
  ]);
  return { account, demographics, posts };
}

/** Metriche account/giorno: followers + engagement_rate(%) + non_follower_pct(%). */
async function fetchAccountMetrics(
  accountId: string,
  platform: string | undefined,
  fromYmd: string,
  toYmd: string
): Promise<ZernioAccountMetrics[]> {
  const followersByDate = new Map<string, number>();
  const erByDate = new Map<string, number>();

  // 1) Follower/giorno da /accounts/follower-stats (cross-platform).
  try {
    const q = new URLSearchParams({ fromDate: fromYmd, toDate: toYmd });
    if (accountId) q.set("accountIds", accountId);
    const res = await zernioFetch<ZernioFollowerStatsResponse>(
      `/accounts/follower-stats?${q.toString()}`
    );
    const series = accountId
      ? res.stats?.[accountId] ?? Object.values(res.stats ?? {})[0] ?? []
      : Object.values(res.stats ?? {})[0] ?? [];
    for (const p of series) if (p?.date) followersByDate.set(p.date, p.followers);
  } catch (e) {
    console.warn(`[zernio] follower-stats non disponibile: ${(e as Error).message}`);
  }

  // 2) Engagement rate/giorno derivato da /analytics/daily-metrics (in PERCENTUALE).
  try {
    const q = new URLSearchParams({ fromDate: fromYmd, toDate: toYmd });
    if (accountId) q.set("accountId", accountId);
    if (platform) q.set("platform", platform);
    const res = await zernioFetch<ZernioDailyMetricsResponse>(
      `/analytics/daily-metrics?${q.toString()}`
    );
    for (const d of res.dailyData ?? []) {
      const m = d.metrics ?? {};
      const reach = m.reach ?? 0;
      if (reach > 0) {
        const interactions =
          (m.likes ?? 0) + (m.comments ?? 0) + (m.shares ?? 0) + (m.saves ?? 0);
        // frazione 0..1 → ×100 per la percentuale attesa dal chart.
        erByDate.set(d.date, (interactions / reach) * 100);
      }
    }
  } catch (e) {
    console.warn(`[zernio] daily-metrics non disponibile: ${(e as Error).message}`);
  }

  // 3) non_follower_pct dal breakdown follower_type (Instagram, total_value → un solo valore).
  let nonFollowerPct: number | null = null;
  if (platform === "instagram" && accountId) {
    try {
      // account-insights: la finestra max è 89 giorni → restringi a 88 (non 90).
      const insightsSince = new Date(
        new Date(`${toYmd}T00:00:00.000Z`).getTime() - 88 * 86_400_000
      )
        .toISOString()
        .slice(0, 10);
      const q = new URLSearchParams({
        accountId,
        metrics: "reach",
        metricType: "total_value",
        breakdown: "follow_type", // Zernio: valore valido è "follow_type" (non "follower_type")
        since: insightsSince,
        until: toYmd,
      });
      const res = await zernioFetch<ZernioAccountInsightsResponse>(
        `/analytics/instagram/account-insights?${q.toString()}`
      );
      const bd = res.metrics?.reach?.breakdowns ?? [];
      const isNonFollower = (dim: string) => /non[_-]?follower/i.test(dim);
      const nf = bd
        .filter((b) => isNonFollower(b.dimension))
        .reduce((s, b) => s + (b.value ?? 0), 0);
      const total = bd.reduce((s, b) => s + (b.value ?? 0), 0);
      if (total > 0) nonFollowerPct = (nf / total) * 100;
    } catch (e) {
      console.warn(`[zernio] account-insights non disponibile: ${(e as Error).message}`);
    }
  }

  // Unione delle date (followers primario), ordinate asc. non_follower_pct (unico valore
  // di finestra) va attaccato solo all'ultima riga per non creare una serie piatta.
  // TODO confermare con dati reali di Luca: se IG esporrà non_follower_pct/giorno, spalmarlo per data.
  const dates = [...new Set([...followersByDate.keys(), ...erByDate.keys()])].sort();
  return dates.map((date, i) => ({
    date,
    followers: followersByDate.get(date) ?? null,
    engagementRate: erByDate.get(date) ?? null,
    nonFollowerPct: i === dates.length - 1 ? nonFollowerPct : null,
  }));
}

/** Demografiche audience (Instagram): age/gender/country → age/gender/geo. */
async function fetchDemographics(
  accountId: string,
  platform: string | undefined
): Promise<ZernioDemographic[]> {
  if (platform !== "instagram" || !accountId) return [];
  const out: ZernioDemographic[] = [];
  const push = (
    dim: ZernioDemographic["dimension"],
    rows: { dimension: string; value: number }[] | undefined
  ) => {
    for (const r of rows ?? []) out.push({ dimension: dim, label: r.dimension, value: r.value });
  };
  // follower_demographics: age / gender / country(→geo) / city
  try {
    const q = new URLSearchParams({
      accountId,
      breakdown: "age,gender,country,city",
      metric: "follower_demographics",
    });
    const res = await zernioFetch<ZernioDemographicsResponse>(
      `/analytics/instagram/demographics?${q.toString()}`
    );
    const d = res.demographics ?? {};
    push("age", d.age);
    push("gender", d.gender);
    push("geo", d.country);
    push("city", d.city);
  } catch (e) {
    console.warn(`[zernio] demographics follower non disponibili: ${(e as Error).message}`);
  }
  // engaged_audience_demographics: chi interagisce (confronto follower-vs-engaged)
  try {
    const q = new URLSearchParams({
      accountId,
      breakdown: "age,gender",
      metric: "engaged_audience_demographics",
    });
    const res = await zernioFetch<ZernioDemographicsResponse>(
      `/analytics/instagram/demographics?${q.toString()}`
    );
    const d = res.demographics ?? {};
    push("age_engaged", d.age);
    push("gender_engaged", d.gender);
  } catch (e) {
    console.warn(`[zernio] demographics engaged non disponibili: ${(e as Error).message}`);
  }
  return out;
}

/** Metriche per-post da GET /v1/analytics (list paginata). */
async function fetchPostMetrics(
  accountId: string,
  platform: string | undefined,
  fromYmd: string,
  toYmd: string
): Promise<ZernioPostMetrics[]> {
  try {
    const q = new URLSearchParams({ fromDate: fromYmd, toDate: toYmd, limit: "100" });
    if (accountId) q.set("accountId", accountId);
    if (platform) q.set("platform", platform);
    const res = await zernioFetch<ZernioAnalyticsListResponse>(`/analytics?${q.toString()}`);
    return (res.posts ?? []).flatMap((p) => {
      const a = p.analytics;
      if (!a) return [];
      // Content.externalId = id restituito da publish() = latePostId lato Zernio.
      // TODO confermare con dati reali di Luca: se publish() restituisce l'External Post id, preferire _id.
      const externalId = String(p.latePostId ?? p._id ?? "");
      if (!externalId) return [];
      return [
        {
          externalId,
          impressions: num(a.impressions),
          reach: num(a.reach),
          likes: num(a.likes),
          comments: num(a.comments),
          saves: num(a.saves),
          shares: num(a.shares),
          clicks: num(a.clicks),
          views: num(a.views),
          engagementRate: num(a.engagementRate),
        },
      ];
    });
  } catch (e) {
    console.warn(`[zernio] analytics per-post non disponibili: ${(e as Error).message}`);
    return [];
  }
}

// --- Fetcher diretti (ONDATA 1): account-insights (12 metriche) + profilo ---

const INSIGHT_METRICS_CSV = INSIGHT_KEYS.join(",");

/** Legge i total_value delle 12 metriche account-insights per la finestra [since, until] (YMD). */
export async function fetchAccountInsights(
  accountId: string,
  since: string,
  until: string
): Promise<Partial<Record<InsightKey, number>>> {
  const out: Partial<Record<InsightKey, number>> = {};
  try {
    const q = new URLSearchParams({
      accountId,
      metrics: INSIGHT_METRICS_CSV,
      metricType: "total_value",
      since,
      until,
    });
    const res = await zernioFetch<ZernioAccountInsightsResponse>(
      `/analytics/instagram/account-insights?${q.toString()}`
    );
    for (const key of INSIGHT_KEYS) {
      const total = res.metrics?.[key]?.total;
      if (typeof total === "number") out[key] = total;
    }
  } catch (e) {
    console.warn(`[zernio] account-insights (${since}..${until}) non disponibile: ${(e as Error).message}`);
  }
  return out;
}

/** Snapshot profilo: following, media count, giorni alla scadenza token. */
export async function fetchAccountProfile(accountId: string): Promise<AccountProfile> {
  try {
    const res = await zernioFetch<{ accounts?: ZernioApiAccountFull[] }>(`/accounts`);
    const acc = res.accounts?.find((a) => a._id === accountId) ?? res.accounts?.[0];
    if (!acc) return { following: null, mediaCount: null, tokenDays: null };
    const extra = acc.metadata?.profileData?.extraData ?? {};
    const expiresAt = acc.tokenExpiresAt ? Date.parse(acc.tokenExpiresAt) : null;
    const tokenDays =
      expiresAt != null && !Number.isNaN(expiresAt)
        ? Math.max(0, Math.round((expiresAt - Date.now()) / 86_400_000))
        : null;
    return {
      following: typeof extra.followsCount === "number" ? extra.followsCount : null,
      mediaCount: typeof extra.mediaCount === "number" ? extra.mediaCount : null,
      tokenDays,
    };
  } catch (e) {
    console.warn(`[zernio] account profile non disponibile: ${(e as Error).message}`);
    return { following: null, mediaCount: null, tokenDays: null };
  }
}

// --- Mapper puri raw-Zernio → record-KPI (Task 2, unit-testabili senza rete) ---

export function ymdToUtcMidnight(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

export function platformToChannel(platform: string): Channel | null {
  return platform === "INSTAGRAM" || platform === "YOUTUBE" || platform === "TIKTOK"
    ? (platform as Channel)
    : null;
}

export type MeasurementUpsert = {
  date: Date;
  // Stringa libera: oltre a followers/engagement_rate/non_follower_pct include i namespace
  // dei dati diretti (ONDATA 1): `insight:<key>:p<period>:cur|:prev`, `profile:*`.
  metric: string;
  value: number;
  series: "Luca";
  channel: Channel | null;
};

export type InsightWindow = {
  period: number;
  current: Partial<Record<InsightKey, number>>;
  previous: Partial<Record<InsightKey, number>>;
};

/** Mapper puro: finestre corrente/precedente per periodo → righe Measurement namespaced.
 *  Scrive `insight:<key>:p<period>:cur|:prev`. Conserva gli 0 reali; salta gli undefined. */
export function mapDirectInsights(
  windows: InsightWindow[],
  channel: Channel | null,
  date: Date
): MeasurementUpsert[] {
  const out: MeasurementUpsert[] = [];
  for (const w of windows) {
    for (const key of INSIGHT_KEYS) {
      const cur = w.current[key];
      if (cur != null)
        out.push({ metric: `insight:${key}:p${w.period}:cur`, value: cur, date, series: "Luca", channel });
      const prev = w.previous[key];
      if (prev != null)
        out.push({ metric: `insight:${key}:p${w.period}:prev`, value: prev, date, series: "Luca", channel });
    }
  }
  return out;
}

export type AccountProfile = {
  following: number | null;
  mediaCount: number | null;
  tokenDays: number | null;
};

/** Mapper puro: snapshot profilo → righe Measurement `profile:*` (single-value). */
export function mapProfile(
  p: AccountProfile,
  channel: Channel | null,
  date: Date
): MeasurementUpsert[] {
  const out: MeasurementUpsert[] = [];
  if (p.following != null) out.push({ metric: "profile:following", value: p.following, date, series: "Luca", channel });
  if (p.mediaCount != null) out.push({ metric: "profile:media", value: p.mediaCount, date, series: "Luca", channel });
  if (p.tokenDays != null) out.push({ metric: "profile:token_days", value: p.tokenDays, date, series: "Luca", channel });
  return out;
}
export function mapAccountMeasurements(
  rows: ZernioAccountMetrics[],
  channel: Channel | null
): MeasurementUpsert[] {
  return rows.flatMap((r) => {
    const date = ymdToUtcMidnight(r.date);
    const out: MeasurementUpsert[] = [];
    // Salta i null (giorni senza dato) per non scrivere zeri fittizi nella serie.
    if (r.followers != null)
      out.push({ date, metric: "followers", value: r.followers, series: "Luca", channel });
    if (r.engagementRate != null)
      out.push({ date, metric: "engagement_rate", value: r.engagementRate, series: "Luca", channel });
    if (r.nonFollowerPct != null)
      out.push({ date, metric: "non_follower_pct", value: r.nonFollowerPct, series: "Luca", channel });
    return out;
  });
}

export type AudienceSegmentUpsert = {
  date: Date;
  dimension: string;
  label: string;
  value: number;
  channel: Channel | null;
};
export function mapAudienceSegments(
  rows: ZernioDemographic[],
  channel: Channel | null,
  date: Date
): AudienceSegmentUpsert[] {
  // Zernio espone CONTEGGI grezzi di persone per label (es. age 18-24 = 173, la
  // somma di ogni dimensione ≈ follower totali). La dashboard (componente Bars)
  // rende `value` come percentuale → normalizza a % PER DIMENSIONE così che ogni
  // dimensione (age/gender/geo) sommi ~100%. value = count / sommaDimensione * 100.
  const totals = new Map<string, number>();
  for (const r of rows) totals.set(r.dimension, (totals.get(r.dimension) ?? 0) + r.value);
  return rows.map((r) => {
    const total = totals.get(r.dimension) ?? 0;
    const value = total > 0 ? (r.value / total) * 100 : 0;
    return { date, dimension: r.dimension, label: r.label, value, channel };
  });
}

export type ContentPerfPatch = {
  views: number | null;
  reach: number | null;
  likes: number | null;
  commentsCount: number | null;
  saves: number | null;
  shares: number | null;
  followsGenerated: number | null;
  nonFollowerPct: number | null;
};
export function mapPostMetrics(p: ZernioPostMetrics): ContentPerfPatch {
  return {
    views: p.views,
    reach: p.reach,
    likes: p.likes,
    commentsCount: p.comments,
    saves: p.saves,
    shares: p.shares,
    // GET /v1/analytics NON espone questi due a livello di post (arrivano da
    // account-insights, non per-post) → null. TODO confermare con dati reali di Luca.
    followsGenerated: null,
    nonFollowerPct: null,
  };
}

/** Scrive righe Measurement "dirette" (insight:*, profile:*) in modo idempotente:
 *  cancella TUTTE le righe della stessa `metric` (Luca) poi ricrea. Evita l'accumulo di
 *  righe datate a refresh successivi (a differenza del delete-per-data di ingestAnalytics). */
export async function writeDirectMeasurements(
  workspaceId: string,
  upserts: MeasurementUpsert[]
): Promise<number> {
  if (upserts.length === 0) return 0;
  const metrics = [...new Set(upserts.map((u) => u.metric))];
  await db.$transaction([
    ...metrics.map((m) =>
      db.measurement.deleteMany({
        where: scopedWhere(workspaceId, { metric: m, series: "Luca" }),
      })
    ),
    ...upserts.map((u) => db.measurement.create({ data: { ...u, workspaceId } })),
  ]);
  return upserts.length;
}

// --- Ingestione idempotente nel DB (Task 3) — unica funzione che scrive ---

export type IngestSummary = {
  measurements: number;
  segments: number;
  postsMatched: number;
  postsMissing: number;
};

export async function ingestAnalytics(
  workspaceId: string,
  analytics: ZernioAnalytics,
  opts: { channel: Channel | null; snapshotDate?: Date }
): Promise<IngestSummary> {
  const measurements = mapAccountMeasurements(analytics.account, opts.channel);
  const snapDate =
    opts.snapshotDate ?? ymdToUtcMidnight(new Date().toISOString().slice(0, 10));
  const segments = mapAudienceSegments(analytics.demographics, opts.channel, snapDate);

  // Idempotenza applicativa (nessun unique in schema): delete-then-create per
  // (metric,date,series,channel) e (dimension,label,date,channel), in transazione.
  await db.$transaction([
    ...measurements.flatMap((m) => [
      db.measurement.deleteMany({
        where: scopedWhere(workspaceId, {
          metric: m.metric,
          series: "Luca",
          channel: m.channel,
          date: m.date,
        }),
      }),
      db.measurement.create({ data: { ...m, workspaceId } }),
    ]),
    ...segments.flatMap((s) => [
      db.audienceSegment.deleteMany({
        where: scopedWhere(workspaceId, {
          dimension: s.dimension,
          label: s.label,
          channel: s.channel,
          date: s.date,
        }),
      }),
      db.audienceSegment.create({ data: { ...s, workspaceId } }),
    ]),
  ]);

  let postsMatched = 0;
  let postsMissing = 0;
  for (const p of analytics.posts) {
    const c = await db.content.findFirst({
      where: scopedWhere(workspaceId, { externalId: p.externalId }),
      select: { id: true },
    });
    if (!c) {
      postsMissing++;
      continue;
    }
    const patch = mapPostMetrics(p);
    await db.content.update({ where: { id: c.id }, data: patch });
    // Append storico ad ogni refresh (voluto: MetricSnapshot è cronologia).
    await db.metricSnapshot.create({
      data: {
        contentId: c.id,
        views: patch.views,
        reach: patch.reach,
        nonFollowerPct: patch.nonFollowerPct,
        likes: patch.likes,
        saves: patch.saves,
        shares: patch.shares,
      },
    });
    postsMatched++;
  }
  return {
    measurements: measurements.length,
    segments: segments.length,
    postsMatched,
    postsMissing,
  };
}

// --- OAuth "Connetti account social" (Task 4) — helper connect/callback ---

/**
 * Ricava un profileId Zernio di default leggendo `GET /v1/accounts`.
 * `SocialAccount.profileId` è `oneOf` string | Profile{_id}. Ritorna null se non
 * ci sono account connessi (risposta reale osservata: `{"accounts":[],...}`).
 */
export async function getDefaultProfileId(): Promise<string | null> {
  // Il profileId sta in GET /profiles (Zernio crea un profilo "Default"), NON in
  // /accounts (vuoto finché non colleghi un social). Prendi il profilo isDefault.
  const res = await zernioFetch<{
    profiles?: { _id: string; isDefault?: boolean }[];
  }>("/profiles");
  const profiles = res.profiles ?? [];
  const def = profiles.find((p) => p.isDefault) ?? profiles[0];
  return def?._id ?? null;
}

/**
 * Avvia il flow OAuth lato Zernio: `GET /v1/connect/{platform}` → { authUrl }.
 * Endpoint reale: il path è `/connect/{platform}` (platform come path param,
 * lowercase enum Zernio), NON `/connect/get-connect-url` (quello è lo slug della
 * pagina doc / operationId). Richiede `profileId` (obbligatorio) e usa `redirect_url`
 * (non `redirectUri`). Se `profileId` non è passato, lo si ricava da /accounts.
 */
export async function getConnectUrl(
  platform: string,
  redirectUri: string,
  profileId?: string
): Promise<string> {
  const pid = profileId ?? (await getDefaultProfileId());
  if (!pid)
    throw new Error(
      "Zernio: nessun profileId disponibile (collega prima un account o passa profileId)"
    );
  const q = new URLSearchParams({ profileId: pid, redirect_url: redirectUri });
  const res = await zernioFetch<{ authUrl: string }>(
    `/connect/${platform.toLowerCase()}?${q.toString()}`
  );
  return res.authUrl;
}

/** Upsert idempotente dell'account social collegato (unique [workspaceId, platform]). */
export async function saveSocialAccount(
  workspaceId: string,
  data: { platform: string; zernioAccountId: string; handle?: string | null }
): Promise<void> {
  await db.socialAccount.upsert({
    where: {
      workspaceId_platform: { workspaceId, platform: data.platform },
    },
    update: { zernioAccountId: data.zernioAccountId, handle: data.handle ?? null },
    create: {
      workspaceId,
      platform: data.platform,
      zernioAccountId: data.zernioAccountId,
      handle: data.handle ?? null,
    },
  });
}

/** Disconnette un account social lato Zernio: DELETE /accounts/{id}.
 *  Best-effort (non lancia): la riga SocialAccount locale la cancella il chiamante. */
export async function disconnectAccount(zernioAccountId: string): Promise<void> {
  if (!isConfigured() || !zernioAccountId) return;
  await zernioFetch(`/accounts/${zernioAccountId}`, { method: "DELETE" }).catch(() => {});
}

// --- Pubblicazione di un contenuto (filone W) ---
// Regola non negoziabile: si pubblica SEMPRE l'originale a piena qualità, MAI il
// proxy di review (`Content.videoProxyUrl`). Il publish path riceve `mediaUrl`
// già risolto dall'originale (masterLink o originale caricato su Blob al publish)
// e, per costruzione, rifiuta se `mediaUrl` coincide col proxy del contenuto.

export type PublishParams = {
  workspaceId: string;
  contentId: string;
  platforms: string[]; // es. ["INSTAGRAM", "YOUTUBE"]
  mediaUrl: string; // URL pubblico dell'ORIGINALE a piena qualità (mai il proxy)
  caption?: string;
  scheduledAt?: Date; // se presente → post programmato
};

export type PublishResult = { externalId: string } | { error: string };

/** Risposta grezza dell'endpoint di pubblicazione Zernio (id del post creato). */
type ZernioPublishResponse = { externalId?: string; id?: string };

/**
 * Pubblica un contenuto via Zernio passando l'URL dell'ORIGINALE a piena qualità.
 * Guardrail anti-degrado: valida che `mediaUrl` sia presente e che NON sia il
 * proxy di review del contenuto; logga esplicitamente "pubblico l'originale a
 * piena qualità". Non lancia: ritorna `{ error }` così il chiamante può marcare
 * `publishState="failed"` e conservare l'originale per il retry.
 */
export async function publish(params: PublishParams): Promise<PublishResult> {
  const { workspaceId, contentId, platforms, mediaUrl, caption, scheduledAt } = params;

  if (!isConfigured()) return { error: "Zernio non configurato" };
  if (!platforms.length) return { error: "Nessuna piattaforma selezionata" };
  if (!mediaUrl) return { error: "Manca l'originale a piena qualità" };

  try {
    // Guardrail anti-proxy per costruzione: mai pubblicare il proxy compresso.
    const content = await db.content.findFirst({
      where: scopedWhere(workspaceId, { id: contentId }),
      select: { videoProxyUrl: true },
    });
    if (content?.videoProxyUrl && content.videoProxyUrl === mediaUrl) {
      return {
        error:
          "Guardrail: mediaUrl è il proxy di review, non l'originale a piena qualità",
      };
    }

    console.info(
      `[zernio.publish] content=${contentId} piattaforme=${platforms.join(
        ","
      )} — pubblico l'originale a piena qualità (${mediaUrl})`
    );

    // SAFETY (filone W): dry-run attivo di DEFAULT. Il post reale parte SOLO con
    // ZERNIO_PUBLISH_DRY_RUN="false" esplicito in env. Così si collauda l'intero
    // flusso (claim atomico, stato → Pubblicato, UI) senza mai inviare un post
    // reale sull'account collegato. L'externalId fittizio `dryrun-*` è distinguibile
    // e non aggancia falsi KPI.
    if (process.env.ZERNIO_PUBLISH_DRY_RUN !== "false") {
      console.warn(
        `[zernio.publish][DRY-RUN] NON invio a Zernio. content=${contentId} platforms=${platforms.join(
          ","
        )} media=${mediaUrl}`
      );
      return { externalId: `dryrun-${contentId}-${Date.now()}` };
    }

    const res = await zernioFetch<ZernioPublishResponse>("/publish", {
      method: "POST",
      body: JSON.stringify({
        contentId,
        platforms,
        mediaUrl,
        caption: caption ?? null,
        scheduledAt: scheduledAt ? scheduledAt.toISOString() : null,
      }),
    });
    const externalId = res.externalId ?? res.id;
    if (!externalId) return { error: "Zernio: risposta senza externalId" };
    return { externalId };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Errore Zernio" };
  }
}
