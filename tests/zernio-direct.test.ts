import { describe, it, expect } from "vitest";
import { mapDirectInsights, mapProfile } from "@/lib/zernio";

const D = new Date("2026-07-07T00:00:00.000Z");

describe("mapDirectInsights", () => {
  it("emette :cur e :prev per ogni metrica presente, con lo stesso date", () => {
    const out = mapDirectInsights(
      [{ period: 30, current: { reach: 120, replies: 0 }, previous: { reach: 100 } }],
      "INSTAGRAM",
      D
    );
    expect(out).toContainEqual({ metric: "insight:reach:p30:cur", value: 120, date: D, series: "Luca", channel: "INSTAGRAM" });
    expect(out).toContainEqual({ metric: "insight:reach:p30:prev", value: 100, date: D, series: "Luca", channel: "INSTAGRAM" });
    // replies=0 (reale) preservato come :cur; nessun :prev perché previous.replies assente
    expect(out).toContainEqual({ metric: "insight:replies:p30:cur", value: 0, date: D, series: "Luca", channel: "INSTAGRAM" });
    expect(out.find((r) => r.metric === "insight:replies:p30:prev")).toBeUndefined();
  });

  it("più periodi → metric namespacate distinte", () => {
    const out = mapDirectInsights(
      [
        { period: 7, current: { views: 5 }, previous: {} },
        { period: 90, current: { views: 40 }, previous: {} },
      ],
      "INSTAGRAM",
      D
    );
    expect(out.map((r) => r.metric).sort()).toEqual(["insight:views:p7:cur", "insight:views:p90:cur"]);
  });
});

describe("mapProfile", () => {
  it("mappa following/media/token_days; salta i null", () => {
    const out = mapProfile({ following: 13, mediaCount: 12, tokenDays: 59 }, "INSTAGRAM", D);
    expect(out.map((r) => r.metric).sort()).toEqual(["profile:following", "profile:media", "profile:token_days"]);
    expect(out.find((r) => r.metric === "profile:following")!.value).toBe(13);
  });
  it("null → nessuna riga", () => {
    expect(mapProfile({ following: null, mediaCount: null, tokenDays: null }, "INSTAGRAM", D)).toHaveLength(0);
  });
});
