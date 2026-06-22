import { describe, it, expect } from "vitest";
import {
  saveRate,
  shareRate,
  reachRate,
  followerGrowthRate,
  conversionToConversation,
  aggregatePerformance,
  periodWindow,
  resolveFilter,
  windowEndpoints,
  buildFunnel,
  type PerfRow,
} from "@/lib/kpi";
import { engagementRate } from "@/lib/content";

describe("saveRate", () => {
  it("computes saves / reach", () => {
    expect(saveRate(50, 1000)).toBeCloseTo(0.05);
  });
  it("returns null when reach is zero or null", () => {
    expect(saveRate(50, 0)).toBeNull();
    expect(saveRate(50, null)).toBeNull();
  });
});

describe("shareRate", () => {
  it("computes shares / reach", () => {
    expect(shareRate(20, 800)).toBeCloseTo(0.025);
  });
  it("returns null without reach", () => {
    expect(shareRate(20, null)).toBeNull();
  });
});

describe("reachRate", () => {
  it("computes reach / follower", () => {
    expect(reachRate(3000, 1500)).toBeCloseTo(2);
  });
  it("returns null without followers", () => {
    expect(reachRate(3000, 0)).toBeNull();
    expect(reachRate(3000, null)).toBeNull();
  });
});

describe("followerGrowthRate", () => {
  it("computes (end - start) / start", () => {
    expect(followerGrowthRate(1000, 1200)).toBeCloseTo(0.2);
  });
  it("handles negative growth", () => {
    expect(followerGrowthRate(1000, 900)).toBeCloseTo(-0.1);
  });
  it("returns null with missing/zero start", () => {
    expect(followerGrowthRate(null, 1200)).toBeNull();
    expect(followerGrowthRate(0, 1200)).toBeNull();
    expect(followerGrowthRate(1000, null)).toBeNull();
  });
});

describe("conversionToConversation", () => {
  it("computes conversations / reach", () => {
    expect(conversionToConversation(5, 10000)).toBeCloseTo(0.0005);
  });
  it("returns null without reach", () => {
    expect(conversionToConversation(5, null)).toBeNull();
  });
});

describe("engagementRate (reused canonical formula)", () => {
  it("matches (likes+comments+saves+shares)/reach", () => {
    expect(
      engagementRate({
        reach: 1000,
        likes: 50,
        commentsCount: 10,
        saves: 20,
        shares: 20,
      })
    ).toBeCloseTo(0.1);
  });
});

describe("aggregatePerformance", () => {
  const rows: PerfRow[] = [
    {
      reach: 1000,
      likes: 50,
      commentsCount: 10,
      saves: 20,
      shares: 20,
      views: 1500,
      followsGenerated: 5,
      nonFollowerPct: 40,
    },
    {
      reach: 3000,
      likes: 150,
      commentsCount: 30,
      saves: 60,
      shares: 60,
      views: 4000,
      followsGenerated: 15,
      nonFollowerPct: 60,
    },
  ];

  it("sums totals", () => {
    const a = aggregatePerformance(rows);
    expect(a.count).toBe(2);
    expect(a.totalReach).toBe(4000);
    expect(a.totalViews).toBe(5500);
    expect(a.totalSaves).toBe(80);
    expect(a.totalFollows).toBe(20);
  });

  it("derives ER from totals (reuses engagementRate)", () => {
    const a = aggregatePerformance(rows);
    // interactions = (50+150)+(10+30)+(20+60)+(20+60) = 400 ; /4000 = 0.1
    expect(a.engagementRate).toBeCloseTo(0.1);
    expect(a.saveRate).toBeCloseTo(80 / 4000);
    expect(a.shareRate).toBeCloseTo(80 / 4000);
  });

  it("weights non-follower % by reach", () => {
    const a = aggregatePerformance(rows);
    // (40*1000 + 60*3000) / 4000 = 55
    expect(a.avgNonFollowerPct).toBeCloseTo(55);
  });

  it("handles empty input", () => {
    const a = aggregatePerformance([]);
    expect(a.count).toBe(0);
    expect(a.engagementRate).toBeNull();
    expect(a.avgNonFollowerPct).toBeNull();
  });
});

describe("periodWindow", () => {
  it("spans `days` back from now", () => {
    const now = new Date("2026-06-22T12:00:00Z");
    const { from, to } = periodWindow(30, now);
    expect(to.getTime()).toBe(now.getTime());
    const diffDays = (to.getTime() - from.getTime()) / 86400000;
    expect(Math.round(diffDays)).toBe(30);
  });
});

describe("resolveFilter", () => {
  const now = new Date("2026-06-22T12:00:00Z");
  it("defaults to 30 days / ALL channel", () => {
    const f = resolveFilter({}, now);
    expect(f.period).toBe(30);
    expect(f.channel).toBe("ALL");
  });
  it("reads valid period and channel", () => {
    const f = resolveFilter({ period: "7", channel: "INSTAGRAM" }, now);
    expect(f.period).toBe(7);
    expect(f.channel).toBe("INSTAGRAM");
  });
  it("rejects invalid period and channel", () => {
    const f = resolveFilter({ period: "999", channel: "FACEBOOK" }, now);
    expect(f.period).toBe(30);
    expect(f.channel).toBe("ALL");
  });
  it("accepts TIKTOK (forward-compat)", () => {
    const f = resolveFilter({ channel: "TIKTOK" }, now);
    expect(f.channel).toBe("TIKTOK");
  });
});

describe("windowEndpoints", () => {
  it("returns first and last by date", () => {
    const rows = [
      { date: new Date("2026-06-10"), value: 1000 },
      { date: new Date("2026-06-20"), value: 1300 },
      { date: new Date("2026-06-01"), value: 900 },
    ];
    const { start, end } = windowEndpoints(rows);
    expect(start).toBe(900);
    expect(end).toBe(1300);
  });
  it("handles empty", () => {
    expect(windowEndpoints([])).toEqual({ start: null, end: null });
  });
});

describe("buildFunnel", () => {
  it("produces 6 stages with conversation as last", () => {
    const perf = aggregatePerformance([
      {
        reach: 1000,
        likes: 50,
        commentsCount: 10,
        saves: 20,
        shares: 20,
        views: 1500,
        followsGenerated: 5,
        nonFollowerPct: 40,
      },
    ]);
    const f = buildFunnel(perf, 3);
    expect(f).toHaveLength(6);
    expect(f[0].label).toBe("Discovery");
    expect(f[5]).toEqual({ label: "Conversazione", value: 3 });
    expect(f[1].value).toBe(1000); // reach
  });
});
