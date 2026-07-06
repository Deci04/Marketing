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
  it("preserva dimension/label/value e applica canale+data", () => {
    const d = ymdToUtcMidnight("2026-07-01");
    const out = mapAudienceSegments([{ dimension: "age", label: "25-34", value: 32 }], "INSTAGRAM", d);
    expect(out[0]).toMatchObject({ dimension: "age", label: "25-34", value: 32, channel: "INSTAGRAM" });
    expect(out[0].date).toBe(d);
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
