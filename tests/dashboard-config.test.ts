import { describe, it, expect } from "vitest";
import { normalizeLayout, splitCard, mergeCards, defaultLayout } from "@/lib/dashboard-config";

describe("metric cards", () => {
  it("defaultLayout include metricCards e relativi items", () => {
    const l = defaultLayout();
    expect(l.metricCards.length).toBeGreaterThan(0);
    for (const mc of l.metricCards) expect(l.items.find((it) => it.i === mc.i)).toBeTruthy();
  });

  it("normalizeLayout droppa metric-card orfane (item mc:* senza metricCards)", () => {
    const raw = { items: [{ i: "mc:ghost", x: 0, y: 0, w: 3, h: 3, minW: 2, minH: 2 }], hidden: [], metricCards: [] };
    const out = normalizeLayout(raw);
    expect(out.items.find((it) => it.i === "mc:ghost")).toBeFalsy();
  });

  it("splitCard esplode un cluster in N card single-metric", () => {
    const base = normalizeLayout({
      items: [{ i: "mc:x", x: 0, y: 0, w: 4, h: 3, minW: 2, minH: 2 }],
      hidden: [],
      metricCards: [{ i: "mc:x", metrics: ["likes", "saves"] }],
    });
    const out = splitCard(base, "mc:x");
    expect(out.metricCards.find((m) => m.i === "mc:x")).toBeFalsy();
    expect(out.metricCards).toHaveLength(2);
    expect(out.metricCards.every((m) => m.metrics.length === 1)).toBe(true);
    for (const m of out.metricCards) expect(out.items.find((it) => it.i === m.i)).toBeTruthy();
  });

  it("mergeCards unisce le metriche nella target e dedup", () => {
    const base = normalizeLayout({
      items: [
        { i: "mc:a", x: 0, y: 0, w: 3, h: 3, minW: 2, minH: 2 },
        { i: "mc:b", x: 3, y: 0, w: 3, h: 3, minW: 2, minH: 2 },
      ],
      hidden: [],
      metricCards: [
        { i: "mc:a", metrics: ["likes"] },
        { i: "mc:b", metrics: ["likes", "saves"] },
      ],
    });
    const out = mergeCards(base, "mc:a", "mc:b");
    expect(out.metricCards.find((m) => m.i === "mc:a")).toBeFalsy();
    expect(out.metricCards.find((m) => m.i === "mc:b")!.metrics).toEqual(["likes", "saves"]);
  });
});
