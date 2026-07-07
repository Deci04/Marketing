// Box catalog + default layout for the movable KPI dashboard.
// Layout coordinates target a 12-column react-grid-layout.

import type { MetricKey } from "@/lib/metric-keys";

export type BoxId =
  | "northStar"
  | "conversionToConversation"
  | "engagementRate"
  | "saveRate"
  | "shareRate"
  | "reachNonFollower"
  | "followerGrowth"
  | "publishedCount"
  | "vsBenchmark"
  | "funnel"
  | "audienceType"
  | "audienceUsage"
  | "postRanking"
  | "bestTime"
  | "postingFrequency"
  | "contentDecay";

export type BoxMeta = {
  id: BoxId;
  title: string;
  description: string;
  group: "brand" | "audience";
  /** default grid item (12-col) */
  default: { x: number; y: number; w: number; h: number; minW: number; minH: number };
};

export const BOX_CATALOG: BoxMeta[] = [
  {
    id: "northStar",
    title: "Conversazioni di valore",
    description: "North Star — chi ti ha scritto e perché",
    group: "brand",
    default: { x: 0, y: 0, w: 6, h: 6, minW: 4, minH: 4 },
  },
  {
    id: "conversionToConversation",
    title: "Conversion to conversation",
    description: "Conversazioni / reach",
    group: "brand",
    default: { x: 6, y: 0, w: 3, h: 3, minW: 2, minH: 2 },
  },
  {
    id: "engagementRate",
    title: "Engagement rate",
    description: "(like+commenti+saves+shares) / reach",
    group: "brand",
    default: { x: 9, y: 0, w: 3, h: 3, minW: 2, minH: 2 },
  },
  {
    id: "saveRate",
    title: "Save rate",
    description: "Saves / reach",
    group: "brand",
    default: { x: 6, y: 3, w: 3, h: 3, minW: 2, minH: 2 },
  },
  {
    id: "shareRate",
    title: "Share rate",
    description: "Shares / reach",
    group: "brand",
    default: { x: 9, y: 3, w: 3, h: 3, minW: 2, minH: 2 },
  },
  {
    id: "reachNonFollower",
    title: "Reach + % non-follower",
    description: "Reach totale e quota non-follower",
    group: "brand",
    default: { x: 0, y: 6, w: 4, h: 3, minW: 3, minH: 2 },
  },
  {
    id: "followerGrowth",
    title: "Follower growth rate",
    description: "Crescita follower sul periodo",
    group: "brand",
    default: { x: 4, y: 6, w: 4, h: 3, minW: 3, minH: 2 },
  },
  {
    id: "publishedCount",
    title: "Contenuti pubblicati",
    description: "Costanza di uscita",
    group: "brand",
    default: { x: 8, y: 6, w: 4, h: 3, minW: 3, minH: 2 },
  },
  {
    id: "vsBenchmark",
    title: "Andamento vs benchmark",
    description: "Serie Luca vs benchmark, multi-metrica",
    group: "brand",
    default: { x: 0, y: 9, w: 8, h: 6, minW: 4, minH: 4 },
  },
  {
    id: "funnel",
    title: "L'imbuto",
    description: "Discovery → Conversazione (6 stadi)",
    group: "brand",
    default: { x: 8, y: 9, w: 4, h: 6, minW: 3, minH: 4 },
  },
  {
    id: "audienceType",
    title: "Tipologia di utente",
    description: "Demografica audience (età/genere/geo/follower)",
    group: "audience",
    default: { x: 0, y: 15, w: 6, h: 5, minW: 4, minH: 4 },
  },
  {
    id: "audienceUsage",
    title: "Utilizzo medio audience",
    description: "Orari/attività + new vs returning",
    group: "audience",
    default: { x: 6, y: 15, w: 6, h: 5, minW: 4, minH: 4 },
  },
  {
    id: "postRanking",
    title: "Classifica post",
    description: "I tuoi post per reach / ER / watch-time",
    group: "audience",
    default: { x: 0, y: 20, w: 6, h: 8, minW: 4, minH: 5 },
  },
  {
    id: "bestTime",
    title: "Orari migliori",
    description: "Heatmap giorno × ora (quando pubblicare)",
    group: "audience",
    default: { x: 6, y: 20, w: 6, h: 6, minW: 4, minH: 4 },
  },
  {
    id: "postingFrequency",
    title: "Frequenza vs engagement",
    description: "La cadenza di pubblicazione ottimale",
    group: "audience",
    default: { x: 6, y: 26, w: 6, h: 4, minW: 3, minH: 3 },
  },
  {
    id: "contentDecay",
    title: "Decadimento contenuti",
    description: "Quanto reggono i post nel tempo",
    group: "audience",
    default: { x: 0, y: 28, w: 6, h: 4, minW: 3, minH: 3 },
  },
];

export const ALL_BOX_IDS = BOX_CATALOG.map((b) => b.id);

export type GridItem = { i: string; x: number; y: number; w: number; h: number; minW: number; minH: number };

/** Card metrica combinabile (ONDATA 1): id `mc:*`, contiene 1..N metriche dirette. */
export type MetricCard = { i: string; metrics: MetricKey[] };

export type StoredLayout = {
  items: GridItem[];
  hidden: BoxId[];
  metricCards: MetricCard[];
};

// I box legacy scendono sotto le card dirette → ordine Diretti → Derivati → Manuali.
const LEGACY_Y_OFFSET = 7;

// Default curato: 4 tile headline + cluster interazioni + card profilo.
export const DEFAULT_METRIC_CARDS: MetricCard[] = [
  { i: "mc:reach", metrics: ["reach"] },
  { i: "mc:views", metrics: ["views"] },
  { i: "mc:accounts_engaged", metrics: ["accounts_engaged"] },
  { i: "mc:total_interactions", metrics: ["total_interactions"] },
  { i: "mc:interazioni", metrics: ["likes", "comments", "saves", "shares", "reposts", "replies"] },
  { i: "mc:profilo", metrics: ["followers_direct", "following", "media", "token_days"] },
];

const METRIC_CARD_DEFAULT_ITEMS: Record<string, GridItem> = {
  "mc:reach": { i: "mc:reach", x: 0, y: 0, w: 3, h: 3, minW: 2, minH: 2 },
  "mc:views": { i: "mc:views", x: 3, y: 0, w: 3, h: 3, minW: 2, minH: 2 },
  "mc:accounts_engaged": { i: "mc:accounts_engaged", x: 6, y: 0, w: 3, h: 3, minW: 2, minH: 2 },
  "mc:total_interactions": { i: "mc:total_interactions", x: 9, y: 0, w: 3, h: 3, minW: 2, minH: 2 },
  "mc:interazioni": { i: "mc:interazioni", x: 0, y: 3, w: 6, h: 4, minW: 3, minH: 3 },
  "mc:profilo": { i: "mc:profilo", x: 6, y: 3, w: 6, h: 4, minW: 3, minH: 3 },
};

function metricCardItem(i: string): GridItem {
  return METRIC_CARD_DEFAULT_ITEMS[i] ?? { i, x: 0, y: 0, w: 3, h: 3, minW: 2, minH: 2 };
}

export function defaultLayout(): StoredLayout {
  return {
    items: [
      ...DEFAULT_METRIC_CARDS.map((mc) => metricCardItem(mc.i)),
      ...BOX_CATALOG.map((b) => ({ i: b.id, ...b.default, y: b.default.y + LEGACY_Y_OFFSET })),
    ],
    hidden: [],
    metricCards: DEFAULT_METRIC_CARDS,
  };
}

/** Validate/normalize a layout loaded from the DB (Json column). */
export function normalizeLayout(raw: unknown): StoredLayout {
  const fallback = defaultLayout();
  if (!raw || typeof raw !== "object") return fallback;
  const obj = raw as Partial<StoredLayout>;
  const items = Array.isArray(obj.items) ? obj.items : [];
  const hidden = Array.isArray(obj.hidden)
    ? obj.hidden.filter((h): h is BoxId => ALL_BOX_IDS.includes(h as BoxId))
    : [];

  // metricCards: campo assente (layout legacy pre-feature) → default curato; presente (anche [])
  // → rispettalo, filtrando le card malformate. Una card orfana (item mc:* senza metricCard) è droppata.
  const metricCards: MetricCard[] =
    obj.metricCards === undefined
      ? fallback.metricCards
      : (Array.isArray(obj.metricCards) ? obj.metricCards : []).filter(
          (m): m is MetricCard =>
            !!m &&
            typeof m.i === "string" &&
            m.i.startsWith("mc:") &&
            Array.isArray(m.metrics) &&
            m.metrics.length > 0
        );
  const mcIds = new Set(metricCards.map((m) => m.i));

  // keep only known boxes (legacy) e metric card valide; scarta il resto
  const byId = new Map<string, GridItem>();
  for (const it of items) {
    if (!it || typeof it.i !== "string") continue;
    const isLegacy = ALL_BOX_IDS.includes(it.i as BoxId);
    const isMetric = it.i.startsWith("mc:") && mcIds.has(it.i);
    if (!isLegacy && !isMetric) continue;
    byId.set(it.i, {
      i: it.i,
      x: Number(it.x) || 0,
      y: Number(it.y) || 0,
      w: Number(it.w) || 3,
      h: Number(it.h) || 3,
      minW: Number(it.minW) || 2,
      minH: Number(it.minH) || 2,
    });
  }
  // reintegra box legacy mancanti (visibili) sotto le card dirette
  for (const b of BOX_CATALOG) {
    if (!byId.has(b.id) && !hidden.includes(b.id)) {
      byId.set(b.id, { i: b.id, ...b.default, y: b.default.y + LEGACY_Y_OFFSET });
    }
  }
  // reintegra l'item per ogni metric card priva di posizione
  for (const mc of metricCards) {
    if (!byId.has(mc.i)) byId.set(mc.i, metricCardItem(mc.i));
  }
  return { items: [...byId.values()], hidden, metricCards };
}

// --- Transform puri su StoredLayout per dividi / unisci / aggiungi / rimuovi card ---

function placeBelow(items: GridItem[], i: string, w: number, h: number): GridItem {
  const maxY = items.reduce((m, it) => Math.max(m, it.y + it.h), 0);
  return { i, x: 0, y: maxY, w, h, minW: 2, minH: 2 };
}

/** Una metrica deve stare in UNA sola card: tieni la prima occorrenza. */
function dedupCards(cards: MetricCard[]): MetricCard[] {
  const seen = new Set<string>();
  return cards
    .map((c) => ({
      ...c,
      metrics: c.metrics.filter((m) => (seen.has(m) ? false : (seen.add(m), true))),
    }))
    .filter((c) => c.metrics.length > 0);
}

/** Esplode una card cluster in N card single-metric (`mc:<metrica>`). */
export function splitCard(layout: StoredLayout, cardId: string): StoredLayout {
  const card = layout.metricCards.find((m) => m.i === cardId);
  if (!card || card.metrics.length < 2) return layout;
  const others = layout.metricCards.filter((m) => m.i !== cardId);
  const newCards: MetricCard[] = card.metrics.map((metric) => ({ i: `mc:${metric}`, metrics: [metric] }));
  const items = layout.items.filter((it) => it.i !== cardId);
  for (const nc of newCards) if (!items.find((it) => it.i === nc.i)) items.push(placeBelow(items, nc.i, 3, 3));
  return { ...layout, items, metricCards: dedupCards([...others, ...newCards]) };
}

/** Unisce le metriche della card sorgente nella target (dedup), rimuove la sorgente. */
export function mergeCards(layout: StoredLayout, srcId: string, dstId: string): StoredLayout {
  const src = layout.metricCards.find((m) => m.i === srcId);
  const dst = layout.metricCards.find((m) => m.i === dstId);
  if (!src || !dst || srcId === dstId) return layout;
  const metrics = [...new Set([...dst.metrics, ...src.metrics])];
  const metricCards = layout.metricCards
    .filter((m) => m.i !== srcId)
    .map((m) => (m.i === dstId ? { ...m, metrics } : m));
  const items = layout.items.filter((it) => it.i !== srcId);
  return { ...layout, items, metricCards };
}

/** Aggiunge una card single-metric (se la metrica non è già in una card). */
export function addMetricCard(layout: StoredLayout, metric: MetricKey): StoredLayout {
  const i = `mc:${metric}`;
  if (layout.metricCards.some((m) => m.metrics.includes(metric))) return layout;
  const items = layout.items.find((it) => it.i === i)
    ? layout.items
    : [...layout.items, placeBelow(layout.items, i, 3, 3)];
  return { ...layout, items, metricCards: [...layout.metricCards, { i, metrics: [metric] }] };
}

/** Rimuove del tutto una metric card (item + membership). */
export function removeMetricCard(layout: StoredLayout, cardId: string): StoredLayout {
  return {
    ...layout,
    items: layout.items.filter((it) => it.i !== cardId),
    metricCards: layout.metricCards.filter((m) => m.i !== cardId),
  };
}
