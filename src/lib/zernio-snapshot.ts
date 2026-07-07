// ONDATA 2 — dati Zernio "ricchi" che non hanno una forma relazionale naturale:
// classifica post, best-time, posting-frequency, content-decay, storico follower.
// Vengono raccolti in un unico blob `ZernioSnapshotData` salvato come Json (modello
// ZernioSnapshot, upsert per workspace). Mapper PURI (testabili senza rete) + fetcher.

import { zernioFetch } from "@/lib/zernio";

// --- Forma tipizzata dello snapshot (ciò che salviamo/leggiamo) ---

export type ZernioPostRow = {
  id: string; // Zernio _id
  caption: string | null;
  thumbnailUrl: string | null;
  postUrl: string | null;
  publishedAt: string | null; // ISO
  mediaType: string | null;
  reach: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  saves: number | null;
  shares: number | null;
  engagementRate: number | null; // % (0..100), come da Zernio
  avgWatchTimeMs: number | null; // igReelsAvgWatchTime
};

export type BestTimeSlot = {
  dayOfWeek: number; // 0 = Lunedì (come da Zernio)
  hour: number; // UTC
  avgEngagement: number;
  postCount: number;
};

export type PostingFrequencyRow = {
  postsPerWeek: number;
  avgEngagementRate: number; // %
  weeksCount: number;
};

export type ContentDecayBucket = {
  order: number;
  label: string;
  avgPctOfFinal: number; // 0..100
  postCount: number;
};

export type FollowerHistoryPoint = {
  date: string; // YYYY-MM-DD
  followers: number | null;
  gained: number | null;
  lost: number | null;
};

export type ZernioSnapshotData = {
  posts: ZernioPostRow[];
  bestTime: BestTimeSlot[];
  postingFrequency: PostingFrequencyRow[];
  contentDecay: ContentDecayBucket[];
  followerHistory: FollowerHistoryPoint[];
};

export const EMPTY_SNAPSHOT: ZernioSnapshotData = {
  posts: [],
  bestTime: [],
  postingFrequency: [],
  contentDecay: [],
  followerHistory: [],
};

const n = (v: unknown): number | null => (typeof v === "number" ? v : null);
const s = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

// --- Forme grezze reali degli endpoint ---

type RawPostsList = {
  posts?: Array<{
    _id?: string;
    content?: string;
    thumbnailUrl?: string;
    platformPostUrl?: string;
    publishedAt?: string;
    mediaType?: string;
    analytics?: {
      reach?: number;
      views?: number;
      likes?: number;
      comments?: number;
      saves?: number;
      shares?: number;
      engagementRate?: number;
      igReelsAvgWatchTime?: number;
    } | null;
  }>;
};
type RawBestTime = {
  slots?: Array<{ day_of_week?: number; hour?: number; avg_engagement?: number; post_count?: number }>;
};
type RawPostingFrequency = {
  frequency?: Array<{ posts_per_week?: number; avg_engagement_rate?: number; weeks_count?: number }>;
};
type RawContentDecay = {
  buckets?: Array<{ bucket_order?: number; bucket_label?: string; avg_pct_of_final?: number; post_count?: number }>;
};
type RawFollowerHistory = {
  metrics?: {
    follower_count?: { values?: Array<{ date?: string; value?: number }> };
    followers_gained?: { values?: Array<{ date?: string; value?: number }> };
    followers_lost?: { values?: Array<{ date?: string; value?: number }> };
  };
};

// --- Mapper PURI (grezzo → tipizzato) ---

export function mapPosts(raw: RawPostsList): ZernioPostRow[] {
  return (raw.posts ?? []).flatMap((p) => {
    const id = s(p._id);
    if (!id) return [];
    const a = p.analytics ?? {};
    return [
      {
        id,
        caption: s(p.content),
        thumbnailUrl: s(p.thumbnailUrl),
        postUrl: s(p.platformPostUrl),
        publishedAt: s(p.publishedAt),
        mediaType: s(p.mediaType),
        reach: n(a.reach),
        views: n(a.views),
        likes: n(a.likes),
        comments: n(a.comments),
        saves: n(a.saves),
        shares: n(a.shares),
        engagementRate: n(a.engagementRate),
        avgWatchTimeMs: n(a.igReelsAvgWatchTime),
      },
    ];
  });
}

export function mapBestTime(raw: RawBestTime): BestTimeSlot[] {
  return (raw.slots ?? []).flatMap((sl) => {
    const dayOfWeek = n(sl.day_of_week);
    const hour = n(sl.hour);
    if (dayOfWeek == null || hour == null) return [];
    return [{ dayOfWeek, hour, avgEngagement: n(sl.avg_engagement) ?? 0, postCount: n(sl.post_count) ?? 0 }];
  });
}

export function mapPostingFrequency(raw: RawPostingFrequency): PostingFrequencyRow[] {
  return (raw.frequency ?? []).flatMap((f) => {
    const postsPerWeek = n(f.posts_per_week);
    if (postsPerWeek == null) return [];
    return [
      {
        postsPerWeek,
        avgEngagementRate: n(f.avg_engagement_rate) ?? 0,
        weeksCount: n(f.weeks_count) ?? 0,
      },
    ];
  });
}

export function mapContentDecay(raw: RawContentDecay): ContentDecayBucket[] {
  return (raw.buckets ?? [])
    .flatMap((b) => {
      const label = s(b.bucket_label);
      if (!label) return [];
      return [
        {
          order: n(b.bucket_order) ?? 0,
          label,
          avgPctOfFinal: n(b.avg_pct_of_final) ?? 0,
          postCount: n(b.post_count) ?? 0,
        },
      ];
    })
    .sort((a, b) => a.order - b.order);
}

export function mapFollowerHistory(raw: RawFollowerHistory): FollowerHistoryPoint[] {
  const m = raw.metrics ?? {};
  const byDate = new Map<string, FollowerHistoryPoint>();
  const merge = (
    values: Array<{ date?: string; value?: number }> | undefined,
    key: "followers" | "gained" | "lost"
  ) => {
    for (const v of values ?? []) {
      const date = s(v.date);
      if (!date) continue;
      const p = byDate.get(date) ?? { date, followers: null, gained: null, lost: null };
      p[key] = n(v.value);
      byDate.set(date, p);
    }
  };
  merge(m.follower_count?.values, "followers");
  merge(m.followers_gained?.values, "gained");
  merge(m.followers_lost?.values, "lost");
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// --- Fetcher (rete): ogni sezione degrada a [] su errore (endpoint premium/flaky) ---

async function safeFetch<R, T>(path: string, map: (r: R) => T, fallback: T, label: string): Promise<T> {
  try {
    return map(await zernioFetch<R>(path));
  } catch (e) {
    console.warn(`[zernio-snapshot] ${label} non disponibile: ${(e as Error).message}`);
    return fallback;
  }
}

/** Costruisce l'intero snapshot ONDATA 2 per un account IG nella finestra [fromYmd, toYmd]. */
export async function buildSnapshot(params: {
  accountId: string;
  platform?: string;
  fromYmd: string;
  toYmd: string;
}): Promise<ZernioSnapshotData> {
  const { accountId, platform, fromYmd, toYmd } = params;
  if (platform?.toLowerCase() !== "instagram" || !accountId) return EMPTY_SNAPSHOT;
  const q = (extra: Record<string, string> = {}) =>
    new URLSearchParams({ accountId, platform: "instagram", ...extra }).toString();

  const [posts, bestTime, postingFrequency, contentDecay, followerHistory] = await Promise.all([
    safeFetch<RawPostsList, ZernioPostRow[]>(
      `/analytics?${q({ fromDate: fromYmd, toDate: toYmd, limit: "100" })}`,
      mapPosts,
      [],
      "posts"
    ),
    safeFetch<RawBestTime, BestTimeSlot[]>(`/analytics/best-time?${q()}`, mapBestTime, [], "best-time"),
    safeFetch<RawPostingFrequency, PostingFrequencyRow[]>(
      `/analytics/posting-frequency?${q()}`,
      mapPostingFrequency,
      [],
      "posting-frequency"
    ),
    safeFetch<RawContentDecay, ContentDecayBucket[]>(
      `/analytics/content-decay?${q()}`,
      mapContentDecay,
      [],
      "content-decay"
    ),
    safeFetch<RawFollowerHistory, FollowerHistoryPoint[]>(
      `/analytics/instagram/follower-history?${new URLSearchParams({ accountId, since: fromYmd, until: toYmd }).toString()}`,
      mapFollowerHistory,
      [],
      "follower-history"
    ),
  ]);
  return { posts, bestTime, postingFrequency, contentDecay, followerHistory };
}
