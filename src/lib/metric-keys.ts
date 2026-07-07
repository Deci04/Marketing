// Costanti + tipi delle metriche DIRETTE Zernio (ONDATA 1).
// CLIENT-SAFE: nessun import (in particolare NIENTE kpi.ts/content.ts/googleapis).
// I client component (dashboard-grid, metric-card) importano DA QUI per non trascinare
// la catena server-only nel bundle browser. kpi.ts re-esporta per retrocompat server-side.

export const INSIGHT_KEYS = [
  "reach", "views", "accounts_engaged", "total_interactions",
  "likes", "comments", "saves", "shares", "replies", "reposts",
  "follows_and_unfollows", "profile_links_taps",
] as const;
export type InsightKey = (typeof INSIGHT_KEYS)[number];

export const PROFILE_KEYS = ["followers_direct", "following", "media", "token_days"] as const;
export type ProfileKey = (typeof PROFILE_KEYS)[number];

export type MetricKey = InsightKey | ProfileKey;

export type DirectMetric = {
  value: number | null;
  deltaAbs: number | null;
  deltaPct: number | null;
};
