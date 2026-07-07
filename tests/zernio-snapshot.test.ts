import { describe, it, expect } from "vitest";
import {
  mapPosts,
  mapBestTime,
  mapPostingFrequency,
  mapContentDecay,
  mapFollowerHistory,
} from "@/lib/zernio-snapshot";

describe("mapPosts", () => {
  it("mappa i campi rich + analytics, salta post senza _id", () => {
    const out = mapPosts({
      posts: [
        {
          _id: "p1",
          content: "Let's start!!!",
          thumbnailUrl: "https://cdn/x.jpg",
          platformPostUrl: "https://instagram.com/reel/1",
          publishedAt: "2026-06-01T10:00:00Z",
          mediaType: "video",
          analytics: { reach: 4496, views: 6712, likes: 216, comments: 21, saves: 25, shares: 21, engagementRate: 4.22, igReelsAvgWatchTime: 17810 },
        },
        { content: "senza id" }, // niente _id → scartato
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "p1", caption: "Let's start!!!", reach: 4496, avgWatchTimeMs: 17810, engagementRate: 4.22 });
  });

  it("analytics null → metriche null", () => {
    const out = mapPosts({ posts: [{ _id: "p2", analytics: null }] });
    expect(out[0].reach).toBeNull();
    expect(out[0].views).toBeNull();
  });
});

describe("mapBestTime", () => {
  it("mappa gli slot, scarta quelli senza giorno/ora", () => {
    const out = mapBestTime({
      slots: [
        { day_of_week: 1, hour: 12, avg_engagement: 283, post_count: 1 },
        { avg_engagement: 5 }, // senza day/hour → scartato
      ],
    });
    expect(out).toEqual([{ dayOfWeek: 1, hour: 12, avgEngagement: 283, postCount: 1 }]);
  });
});

describe("mapPostingFrequency", () => {
  it("mappa le righe con posts_per_week", () => {
    const out = mapPostingFrequency({
      frequency: [{ posts_per_week: 2, avg_engagement_rate: 4.21, weeks_count: 3 }],
    });
    expect(out).toEqual([{ postsPerWeek: 2, avgEngagementRate: 4.21, weeksCount: 3 }]);
  });
});

describe("mapContentDecay", () => {
  it("ordina per bucket_order e scarta senza label", () => {
    const out = mapContentDecay({
      buckets: [
        { bucket_order: 2, bucket_label: "30d+", avg_pct_of_final: 100, post_count: 4 },
        { bucket_order: 1, bucket_label: "7-30d", avg_pct_of_final: 100, post_count: 8 },
        { bucket_order: 3 }, // senza label → scartato
      ],
    });
    expect(out.map((b) => b.label)).toEqual(["7-30d", "30d+"]);
  });
});

describe("mapFollowerHistory", () => {
  it("unisce le tre metriche per data, ordinate", () => {
    const out = mapFollowerHistory({
      metrics: {
        follower_count: { values: [{ date: "2026-07-02", value: 318 }, { date: "2026-07-01", value: 317 }] },
        followers_gained: { values: [{ date: "2026-07-02", value: 1 }] },
        followers_lost: { values: [{ date: "2026-07-02", value: 0 }] },
      },
    });
    expect(out.map((p) => p.date)).toEqual(["2026-07-01", "2026-07-02"]);
    expect(out[1]).toEqual({ date: "2026-07-02", followers: 318, gained: 1, lost: 0 });
    expect(out[0]).toEqual({ date: "2026-07-01", followers: 317, gained: null, lost: null });
  });

  it("vuoto quando le serie sono assenti (account nuovo)", () => {
    expect(mapFollowerHistory({ metrics: {} })).toEqual([]);
  });
});
