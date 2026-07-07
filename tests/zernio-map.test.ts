import { describe, it, expect } from "vitest";
import {
  ymdToUtcMidnight,
  platformToChannel,
  mapAccountMeasurements,
  mapAudienceSegments,
  mapPostMetrics,
} from "@/lib/zernio";

describe("ymdToUtcMidnight", () => {
  it("produce mezzanotte UTC", () => {
    expect(ymdToUtcMidnight("2026-07-01").toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });
});

describe("platformToChannel", () => {
  it("mappa i canali noti e degrada a null", () => {
    expect(platformToChannel("INSTAGRAM")).toBe("INSTAGRAM");
    expect(platformToChannel("LINKEDIN")).toBeNull();
  });
});

describe("mapAccountMeasurements", () => {
  it("espande ogni giorno in 3 Measurement (followers/engagement_rate/non_follower_pct)", () => {
    // engagement_rate è in PERCENTUALE (es. 5 = 5%).
    const out = mapAccountMeasurements(
      [{ date: "2026-07-01", followers: 1000, engagementRate: 5, nonFollowerPct: 40 }],
      "INSTAGRAM"
    );
    expect(out).toHaveLength(3);
    const followers = out.find((m) => m.metric === "followers")!;
    expect(followers.value).toBe(1000);
    expect(followers.series).toBe("Luca");
    expect(followers.channel).toBe("INSTAGRAM");
    expect(followers.date.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(out.find((m) => m.metric === "engagement_rate")!.value).toBe(5);
    expect(out.find((m) => m.metric === "non_follower_pct")!.value).toBe(40);
  });

  it("salta i valori null (nessun Measurement con zeri fittizi)", () => {
    const out = mapAccountMeasurements(
      [{ date: "2026-07-01", followers: 1000, engagementRate: null, nonFollowerPct: null }],
      null
    );
    expect(out).toHaveLength(1);
    expect(out[0].metric).toBe("followers");
  });
});

describe("mapAudienceSegments", () => {
  it("normalizza i CONTEGGI grezzi a % PER DIMENSIONE (ogni dimensione somma ~100)", () => {
    const d = ymdToUtcMidnight("2026-07-01");
    // conteggi grezzi di persone (come li restituisce Zernio)
    const out = mapAudienceSegments(
      [
        { dimension: "age", label: "18-24", value: 173 },
        { dimension: "age", label: "25-34", value: 92 },
        { dimension: "age", label: "35-44", value: 52 },
        { dimension: "gender", label: "M", value: 219 },
        { dimension: "gender", label: "F", value: 98 },
      ],
      "INSTAGRAM",
      d
    );
    const age1824 = out.find((s) => s.dimension === "age" && s.label === "18-24")!;
    expect(age1824).toMatchObject({ dimension: "age", label: "18-24", channel: "INSTAGRAM" });
    expect(age1824.date).toBe(d);
    // 173 / (173+92+52) * 100 = 54.57%
    expect(age1824.value).toBeCloseTo(54.57, 1);
    // ogni dimensione somma ~100%
    const sum = (dim: string) =>
      out.filter((s) => s.dimension === dim).reduce((a, s) => a + s.value, 0);
    expect(sum("age")).toBeCloseTo(100, 5);
    expect(sum("gender")).toBeCloseTo(100, 5);
  });

  it("dimensione con somma 0 → value 0 (niente divisione per zero)", () => {
    const d = ymdToUtcMidnight("2026-07-01");
    const out = mapAudienceSegments([{ dimension: "age", label: "18-24", value: 0 }], null, d);
    expect(out[0].value).toBe(0);
  });
});

describe("mapPostMetrics", () => {
  it("rinomina comments→commentsCount e azzera i campi non esposti per-post", () => {
    const patch = mapPostMetrics({
      externalId: "post_ext_1",
      impressions: 15,
      views: 10,
      reach: 8,
      likes: 3,
      comments: 2,
      saves: 1,
      shares: 0,
      clicks: 4,
      engagementRate: 8.62,
    });
    expect(patch.commentsCount).toBe(2);
    expect(patch.reach).toBe(8);
    expect("comments" in patch).toBe(false);
    // /v1/analytics non espone questi due a livello di post → null.
    expect(patch.followsGenerated).toBeNull();
    expect(patch.nonFollowerPct).toBeNull();
  });
});

describe("mapAudienceSegments — city + engaged", () => {
  it("normalizza a % per-dimensione anche city e *_engaged", () => {
    const date = new Date("2026-07-07T00:00:00.000Z");
    const out = mapAudienceSegments(
      [
        { dimension: "city", label: "Roncade", value: 13 },
        { dimension: "city", label: "Treviso", value: 7 },
        { dimension: "age_engaged", label: "18-24", value: 182 },
        { dimension: "age_engaged", label: "25-34", value: 18 },
      ],
      "INSTAGRAM",
      date
    );
    const city = out.filter((r) => r.dimension === "city");
    expect(Math.round(city.reduce((s, r) => s + r.value, 0))).toBe(100);
    const eng = out.find((r) => r.dimension === "age_engaged" && r.label === "18-24");
    expect(Math.round(eng!.value)).toBe(91); // 182/200
  });
});
