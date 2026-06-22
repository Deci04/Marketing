// Box catalog + default layout for the movable KPI dashboard.
// Layout coordinates target a 12-column react-grid-layout.

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
  | "audienceUsage";

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
];

export const ALL_BOX_IDS = BOX_CATALOG.map((b) => b.id);

export type GridItem = { i: string; x: number; y: number; w: number; h: number; minW: number; minH: number };

export type StoredLayout = {
  items: GridItem[];
  hidden: BoxId[];
};

export function defaultLayout(): StoredLayout {
  return {
    items: BOX_CATALOG.map((b) => ({ i: b.id, ...b.default })),
    hidden: [],
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

  // keep only known boxes; merge in any newly-added catalog boxes as visible defaults
  const byId = new Map<string, GridItem>();
  for (const it of items) {
    if (it && typeof it.i === "string" && ALL_BOX_IDS.includes(it.i as BoxId)) {
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
  }
  for (const b of BOX_CATALOG) {
    if (!byId.has(b.id) && !hidden.includes(b.id)) {
      byId.set(b.id, { i: b.id, ...b.default });
    }
  }
  return { items: [...byId.values()], hidden };
}
