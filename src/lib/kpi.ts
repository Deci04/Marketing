import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/workspace";
import { engagementRate } from "@/lib/content";
import type { Channel } from "@prisma/client";

export type SeriesPoint = {
  date: string;
  Luca: number | null;
  Benchmark: number | null;
};

// --- Filters (period + channel) shared by all dashboard boxes ---

export type ChannelFilter = "ALL" | Channel;

export type KpiFilter = {
  /** inclusive lower bound */
  from: Date;
  /** inclusive upper bound */
  to: Date;
  channel: ChannelFilter;
};

/** Period presets used by the dashboard filter bar. */
export const PERIOD_PRESETS = [7, 30, 90] as const;
export type PeriodDays = (typeof PERIOD_PRESETS)[number];

// --- Metriche DIRETTE da Zernio account-insights (ONDATA 1) ---
// Costanti/tipi definiti in metric-keys.ts (CLIENT-SAFE); qui re-esportati per i consumer server.
export {
  INSIGHT_KEYS,
  PROFILE_KEYS,
  type InsightKey,
  type ProfileKey,
  type MetricKey,
  type DirectMetric,
} from "@/lib/metric-keys";
import { INSIGHT_KEYS, type InsightKey, type MetricKey, type DirectMetric } from "@/lib/metric-keys";

/** Legge le righe Measurement namespaced `insight:<key>:p<period>:cur|:prev` → delta per metrica. */
export function readInsightDeltas(
  rows: { metric: string; value: number }[],
  period: number
): Record<InsightKey, DirectMetric> {
  const byMetric = new Map<string, number>();
  for (const r of rows) byMetric.set(r.metric, r.value);
  const out = {} as Record<InsightKey, DirectMetric>;
  for (const key of INSIGHT_KEYS) {
    const cur = byMetric.get(`insight:${key}:p${period}:cur`);
    const prev = byMetric.get(`insight:${key}:p${period}:prev`);
    const value = cur ?? null;
    const deltaAbs = cur != null && prev != null ? cur - prev : null;
    const deltaPct =
      cur != null && prev != null && prev !== 0 ? ((cur - prev) / prev) * 100 : null;
    out[key] = { value, deltaAbs, deltaPct };
  }
  return out;
}

/** Build a {from,to} window ending today, going back `days` days. */
export function periodWindow(days: number, now: Date = new Date()): {
  from: Date;
  to: Date;
} {
  const to = new Date(now);
  const from = new Date(now);
  from.setDate(from.getDate() - days);
  return { from, to };
}

/** Resolve filter from URL searchParams (period + channel). */
export function resolveFilter(
  searchParams: Record<string, string | string[] | undefined>,
  now: Date = new Date()
): KpiFilter & { period: PeriodDays } {
  const periodRaw = Number(
    Array.isArray(searchParams.period)
      ? searchParams.period[0]
      : searchParams.period
  );
  const period: PeriodDays = (PERIOD_PRESETS as readonly number[]).includes(
    periodRaw
  )
    ? (periodRaw as PeriodDays)
    : 30;

  const channelRaw = Array.isArray(searchParams.channel)
    ? searchParams.channel[0]
    : searchParams.channel;
  const channel: ChannelFilter =
    channelRaw === "INSTAGRAM" ||
    channelRaw === "YOUTUBE" ||
    channelRaw === "TIKTOK"
      ? (channelRaw as Channel)
      : "ALL";

  const { from, to } = periodWindow(period, now);
  return { from, to, channel, period };
}

// --- Pure formula helpers (unit-tested in tests/kpi.test.ts) ---

/** saves / reach. Null when reach unknown/zero. */
export function saveRate(saves: number, reach: number | null): number | null {
  if (!reach || reach <= 0) return null;
  return saves / reach;
}

/** shares / reach. Null when reach unknown/zero. */
export function shareRate(shares: number, reach: number | null): number | null {
  if (!reach || reach <= 0) return null;
  return shares / reach;
}

/** reach / follower. Null when follower count unknown/zero. */
export function reachRate(
  reach: number,
  followers: number | null
): number | null {
  if (!followers || followers <= 0) return null;
  return reach / followers;
}

/**
 * Monthly-style follower growth rate over a window:
 * (end - start) / start. Null when start unknown/zero.
 */
export function followerGrowthRate(
  start: number | null,
  end: number | null
): number | null {
  if (start == null || end == null || start <= 0) return null;
  return (end - start) / start;
}

/** value conversations / reach. Null when reach unknown/zero. */
export function conversionToConversation(
  conversations: number,
  reach: number | null
): number | null {
  if (!reach || reach <= 0) return null;
  return conversations / reach;
}

export type PerfRow = {
  reach: number | null;
  likes: number | null;
  commentsCount: number | null;
  saves: number | null;
  shares: number | null;
  views: number | null;
  followsGenerated: number | null;
  nonFollowerPct: number | null;
};

export type AggregatedPerformance = {
  count: number;
  totalReach: number;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalSaves: number;
  totalShares: number;
  totalFollows: number;
  /** weighted-by-reach average non-follower % (0..100) */
  avgNonFollowerPct: number | null;
  /** derived rates (fractions, not %) */
  engagementRate: number | null;
  saveRate: number | null;
  shareRate: number | null;
};

/**
 * Aggregate per-content performance into account-level totals + derived rates.
 * Engagement rate reuses the canonical engagementRate() from content.ts.
 */
export function aggregatePerformance(rows: PerfRow[]): AggregatedPerformance {
  let totalReach = 0,
    totalViews = 0,
    totalLikes = 0,
    totalComments = 0,
    totalSaves = 0,
    totalShares = 0,
    totalFollows = 0;
  let nfWeighted = 0,
    nfWeight = 0;
  let count = 0;

  for (const r of rows) {
    count++;
    totalReach += r.reach ?? 0;
    totalViews += r.views ?? 0;
    totalLikes += r.likes ?? 0;
    totalComments += r.commentsCount ?? 0;
    totalSaves += r.saves ?? 0;
    totalShares += r.shares ?? 0;
    totalFollows += r.followsGenerated ?? 0;
    if (r.nonFollowerPct != null && r.reach != null && r.reach > 0) {
      nfWeighted += r.nonFollowerPct * r.reach;
      nfWeight += r.reach;
    }
  }

  return {
    count,
    totalReach,
    totalViews,
    totalLikes,
    totalComments,
    totalSaves,
    totalShares,
    totalFollows,
    avgNonFollowerPct: nfWeight > 0 ? nfWeighted / nfWeight : null,
    engagementRate: engagementRate({
      reach: totalReach,
      likes: totalLikes,
      commentsCount: totalComments,
      saves: totalSaves,
      shares: totalShares,
    }),
    saveRate: saveRate(totalSaves, totalReach || null),
    shareRate: shareRate(totalShares, totalReach || null),
  };
}

// --- Legacy series helpers (kept; used by the vs-benchmark chart) ---

export async function getMetricSeries(
  workspaceId: string,
  metric: string,
  channel?: ChannelFilter,
  window?: { from: Date; to: Date }
): Promise<SeriesPoint[]> {
  const rows = await db.measurement.findMany({
    where: scopedWhere(workspaceId, {
      metric,
      ...(channel && channel !== "ALL" ? { channel } : {}),
      ...(window ? { date: { gte: window.from, lte: window.to } } : {}),
    }),
    orderBy: { date: "asc" },
  });
  const byDate = new Map<string, SeriesPoint>();
  for (const r of rows) {
    const key = r.date.toISOString().slice(0, 10);
    const p = byDate.get(key) ?? { date: key, Luca: null, Benchmark: null };
    if (r.series === "Luca") p.Luca = r.value;
    else if (r.series === "Benchmark") p.Benchmark = r.value;
    byDate.set(key, p);
  }
  return [...byDate.values()];
}

export type MetricSummary = {
  latest: number | null;
  prev: number | null;
  benchmark: number | null;
};

export function summarize(series: SeriesPoint[]): MetricSummary {
  const luca = series.map((p) => p.Luca).filter((v): v is number => v != null);
  const latest = luca.length ? luca[luca.length - 1] : null;
  const prev = luca.length > 1 ? luca[luca.length - 2] : null;
  const benchmark =
    series.map((p) => p.Benchmark).filter((v): v is number => v != null).pop() ??
    null;
  return { latest, prev, benchmark };
}

/** Pick first/last value of a date-ordered Measurement series within a window. */
export function windowEndpoints(
  rows: { date: Date; value: number }[]
): { start: number | null; end: number | null } {
  if (rows.length === 0) return { start: null, end: null };
  const sorted = [...rows].sort((a, b) => a.date.getTime() - b.date.getTime());
  return { start: sorted[0].value, end: sorted[sorted.length - 1].value };
}

// --- Dashboard data assembly (period + channel aware) ---

export type AudienceBucket = { label: string; value: number };
export type AudienceData = Record<string, AudienceBucket[]>;

export type KpiData = {
  filter: { period: PeriodDays; channel: ChannelFilter };
  perf: AggregatedPerformance;
  followerGrowth: number | null;
  followerLatest: number | null;
  conversionToConversation: number | null;
  reachRate: number | null;
  /**
   * % reach da non-follower (0..100), a livello ACCOUNT. Viene dal Measurement
   * `non_follower_pct` (account-insights), non dai post: `mapPostMetrics` non lo
   * espone per-post, quindi `perf.avgNonFollowerPct` resta null. Il box
   * "Reach + % non-follower" legge QUESTO campo.
   */
  nonFollowerPct: number | null;
  /** Metriche DIRETTE da Zernio (ONDATA 1): 12 insight + profilo, con delta per periodo. */
  directMetrics: Record<MetricKey, DirectMetric>;
  /** Reach a LIVELLO ACCOUNT (account-insights) per il periodo — fallback quando i post non sono agganciati. */
  accountReach: number | null;
  /** Save/Share rate a livello account (saves|shares / reach account), frazione 0..1. */
  accountSaveRate: number | null;
  accountShareRate: number | null;
  publishedCount: number;
  valueConversations: {
    id: string;
    date: string;
    who: string;
    what: string;
    channel: string | null;
    link: string | null;
  }[];
  // chart series (vs benchmark) keyed by metric
  series: Record<string, SeriesPoint[]>;
  seriesSummary: Record<string, MetricSummary>;
  benchmarks: {
    id: string;
    metric: string;
    value: number;
    rangeLabel: string | null;
    source: string | null;
    channel: Channel | null;
  }[];
  measurements: {
    id: string;
    date: string;
    metric: string;
    value: number;
    series: string;
    channel: Channel | null;
  }[];
  audience: AudienceData;
  audienceSegments: {
    id: string;
    date: string;
    dimension: string;
    label: string;
    value: number;
    channel: Channel | null;
  }[];
  // funnel stages (6)
  funnel: { label: string; value: number }[];
};

const CHART_METRICS = ["engagement_rate", "non_follower_pct", "followers"];

export async function getKpiData(
  workspaceId: string,
  filter: KpiFilter & { period: PeriodDays }
): Promise<KpiData> {
  const channelWhere =
    filter.channel !== "ALL" ? { channel: filter.channel } : {};

  const [
    contents,
    vc,
    followerRows,
    benchmarks,
    measurements,
    audienceSegments,
    seriesRows,
    directRows,
  ] = await Promise.all([
    db.content.findMany({
      where: scopedWhere(workspaceId, {
        ...channelWhere,
        publishAt: { gte: filter.from, lte: filter.to },
      }),
      select: {
        reach: true,
        likes: true,
        commentsCount: true,
        saves: true,
        shares: true,
        views: true,
        followsGenerated: true,
        nonFollowerPct: true,
        publishAt: true,
      },
    }),
    db.valueConversation.findMany({
      where: scopedWhere(workspaceId, {
        date: { gte: filter.from, lte: filter.to },
        ...(filter.channel !== "ALL"
          ? { channel: channelLabel(filter.channel) }
          : {}),
      }),
      orderBy: { date: "desc" },
    }),
    db.measurement.findMany({
      where: scopedWhere(workspaceId, {
        metric: "followers",
        date: { gte: filter.from, lte: filter.to },
        series: "Luca",
        ...channelWhere,
      }),
      select: { date: true, value: true },
    }),
    db.benchmark.findMany({
      where: scopedWhere(workspaceId, { ...channelWhere }),
      orderBy: { metric: "asc" },
    }),
    db.measurement.findMany({
      where: scopedWhere(workspaceId),
      orderBy: { date: "desc" },
      take: 200,
    }),
    db.audienceSegment.findMany({
      where: scopedWhere(workspaceId, { ...channelWhere }),
      orderBy: { date: "desc" },
    }),
    Promise.all(
      CHART_METRICS.map((m) =>
        getMetricSeries(workspaceId, m, filter.channel, { from: filter.from, to: filter.to })
      )
    ),
    db.measurement.findMany({
      where: scopedWhere(workspaceId, {
        series: "Luca",
        ...channelWhere,
        OR: [{ metric: { startsWith: "insight:" } }, { metric: { startsWith: "profile:" } }],
      }),
      select: { metric: true, value: true },
    }),
  ]);

  const perf = aggregatePerformance(contents);
  const { start, end } = windowEndpoints(followerRows);
  const followerGrowth = followerGrowthRate(start, end);

  const series: Record<string, SeriesPoint[]> = {};
  const seriesSummary: Record<string, MetricSummary> = {};
  CHART_METRICS.forEach((m, i) => {
    series[m] = seriesRows[i];
    seriesSummary[m] = summarize(seriesRows[i]);
  });

  // audience grouped by dimension, latest value per label
  const audience: AudienceData = {};
  const seen = new Set<string>();
  for (const s of audienceSegments) {
    const key = `${s.dimension}::${s.label}`;
    if (seen.has(key)) continue; // first = latest (ordered desc by date)
    seen.add(key);
    (audience[s.dimension] ??= []).push({ label: s.label, value: s.value });
  }

  const reachRateVal = reachRate(perf.totalReach, end);

  // non_follower_pct è account-level (Measurement), non per-post: prendilo dal
  // riepilogo della serie (ultimo valore di finestra), con fallback all'eventuale
  // media pesata per-post. Il box "Reach + % non-follower" legge questo.
  const nonFollowerPct =
    seriesSummary["non_follower_pct"]?.latest ?? perf.avgNonFollowerPct;

  // Engagement rate tile: `perf.engagementRate` (frazione) è calcolato dai post
  // agganciati a Content. Quando nessun post è matchato (Content vuoto) resta null
  // pur essendoci l'ER account reale nella serie Measurement (in %, come il chart):
  // fallback a quello (÷100 → frazione, coerente con pct() del box).
  if (perf.engagementRate == null) {
    const erLatestPct = seriesSummary["engagement_rate"]?.latest;
    if (erLatestPct != null) perf.engagementRate = erLatestPct / 100;
  }

  const funnel = buildFunnel(perf, vc.length);

  // Metriche dirette (ONDATA 1): 12 insight con delta per periodo + profilo (single value).
  const insight = readInsightDeltas(directRows, filter.period);
  const byDirect = new Map(directRows.map((r) => [r.metric, r.value]));
  const profileMetric = (metric: string): DirectMetric => ({
    value: byDirect.get(metric) ?? null,
    deltaAbs: null,
    deltaPct: null,
  });
  const directMetrics: Record<MetricKey, DirectMetric> = {
    ...insight,
    followers_direct: { value: end, deltaAbs: null, deltaPct: followerGrowth },
    following: profileMetric("profile:following"),
    media: profileMetric("profile:media"),
    token_days: profileMetric("profile:token_days"),
  };

  // Rate a livello ACCOUNT dal periodo (account-insights) — usate come fallback nei box
  // quando i post non sono agganciati a Content (perf.* = 0).
  const accountReach = directMetrics.reach.value;
  const accountSaveRate = saveRate(directMetrics.saves.value ?? 0, accountReach);
  const accountShareRate = shareRate(directMetrics.shares.value ?? 0, accountReach);

  return {
    filter: { period: filter.period, channel: filter.channel },
    perf,
    followerGrowth,
    followerLatest: end,
    conversionToConversation: conversionToConversation(
      vc.length,
      perf.totalReach || null
    ),
    reachRate: reachRateVal,
    nonFollowerPct,
    directMetrics,
    accountReach,
    accountSaveRate,
    accountShareRate,
    publishedCount: contents.filter((c) => c.publishAt != null).length,
    valueConversations: vc.map((c) => ({
      id: c.id,
      date: c.date.toISOString(),
      who: c.who,
      what: c.what,
      channel: c.channel,
      link: c.link,
    })),
    series,
    seriesSummary,
    benchmarks: benchmarks.map((b) => ({
      id: b.id,
      metric: b.metric,
      value: b.value,
      rangeLabel: b.rangeLabel,
      source: b.source,
      channel: b.channel,
    })),
    measurements: measurements.map((m) => ({
      id: m.id,
      date: m.date.toISOString(),
      metric: m.metric,
      value: m.value,
      series: m.series,
      channel: m.channel,
    })),
    audience,
    audienceSegments: audienceSegments.map((s) => ({
      id: s.id,
      date: s.date.toISOString(),
      dimension: s.dimension,
      label: s.label,
      value: s.value,
      channel: s.channel,
    })),
    funnel,
  };
}

/** ValueConversation.channel is a free String; map enum -> readable label. */
function channelLabel(channel: Channel): string {
  if (channel === "INSTAGRAM") return "Instagram";
  if (channel === "YOUTUBE") return "YouTube";
  return "TikTok";
}

/**
 * 6-stage funnel Discovery -> Conversation, derived from aggregated reach.
 * Each stage uses a real signal where available; intermediate stages fall
 * back to proportional estimates from the metrics we do have.
 */
export function buildFunnel(
  perf: AggregatedPerformance,
  conversations: number
): { label: string; value: number }[] {
  const discovery = perf.totalViews || perf.totalReach;
  const reach = perf.totalReach;
  const interactions =
    perf.totalLikes + perf.totalComments + perf.totalSaves + perf.totalShares;
  const saves = perf.totalSaves + perf.totalShares;
  const follows = perf.totalFollows;
  return [
    { label: "Discovery", value: discovery },
    { label: "Reach", value: reach },
    { label: "Risonanza", value: interactions },
    { label: "Interesse", value: saves },
    { label: "Conversione", value: follows },
    { label: "Conversazione", value: conversations },
  ];
}

// --- Backwards-compatible overview (kept for any older callers) ---

/** Create a value conversation (the North Star signal). Workspace-scoped. */
export async function addValueConversation(
  workspaceId: string,
  data: {
    who: string;
    what: string;
    date?: Date | null;
    channel?: string | null;
    link?: string | null;
  }
) {
  return db.valueConversation.create({
    data: {
      workspaceId,
      who: data.who,
      what: data.what,
      date: data.date ?? new Date(),
      channel: data.channel ?? null,
      link: data.link ?? null,
    },
  });
}

/** Lightweight count for the home stat — avoids the full getKpiOverview
 *  (which also re-fetches all content + metric series the home doesn't use). */
export async function countValueConversations(workspaceId: string) {
  return db.valueConversation.count({ where: scopedWhere(workspaceId) });
}

export async function getKpiOverview(workspaceId: string) {
  const [erSeries, nfSeries, vc, contents] = await Promise.all([
    getMetricSeries(workspaceId, "engagement_rate"),
    getMetricSeries(workspaceId, "non_follower_pct"),
    db.valueConversation.findMany({
      where: scopedWhere(workspaceId),
      orderBy: { date: "desc" },
    }),
    db.content.findMany({ where: scopedWhere(workspaceId) }),
  ]);
  const published = contents.filter((c) => c.publishAt != null).length;
  return {
    erSeries,
    nfSeries,
    er: summarize(erSeries),
    nf: summarize(nfSeries),
    vc,
    publishedCount: published,
  };
}
