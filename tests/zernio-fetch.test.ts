import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchAnalytics, ZERNIO_BASE } from "@/lib/zernio";

afterEach(() => vi.restoreAllMocks());

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200 });

// Router che risponde con le shape GREZZE reali dei singoli endpoint Zernio.
// (fetchAnalytics aggrega più endpoint in una sola ZernioAnalytics.)
function mockZernio() {
  return vi.spyOn(global, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes("/accounts/follower-stats")) {
      return json({
        stats: {
          acc_1: [
            { date: "2026-07-01", followers: 1000 },
            { date: "2026-07-02", followers: 1025 },
          ],
        },
      });
    }
    if (url.includes("/analytics/daily-metrics")) {
      return json({
        dailyData: [
          {
            date: "2026-07-01",
            metrics: { reach: 9000, likes: 540, comments: 62, saves: 130, shares: 44 },
          },
          {
            date: "2026-07-02",
            metrics: { reach: 9500, likes: 600, comments: 70, saves: 140, shares: 50 },
          },
        ],
      });
    }
    if (url.includes("/analytics/instagram/account-insights")) {
      return json({
        metrics: {
          reach: {
            total: 18500,
            breakdowns: [
              { dimension: "FOLLOWER", value: 11100 },
              { dimension: "NON_FOLLOWER", value: 7400 },
            ],
          },
        },
      });
    }
    if (url.includes("/analytics/instagram/demographics")) {
      return json({
        demographics: {
          age: [
            { dimension: "25-34", value: 32 },
            { dimension: "35-44", value: 21 },
          ],
          gender: [
            { dimension: "F", value: 58 },
            { dimension: "M", value: 42 },
          ],
          country: [{ dimension: "IT", value: 71 }],
        },
      });
    }
    if (url.includes("/analytics")) {
      return json({
        posts: [
          {
            _id: "p1",
            latePostId: "post_ext_1",
            platform: "instagram",
            analytics: {
              impressions: 15000,
              reach: 9000,
              likes: 540,
              comments: 62,
              saves: 130,
              shares: 44,
              clicks: 89,
              views: 12000,
              engagementRate: 8.62,
            },
          },
        ],
      });
    }
    return json({});
  });
}

describe("fetchAnalytics", () => {
  it("aggrega gli endpoint reali col Bearer e normalizza la risposta", async () => {
    process.env.ZERNIO_API_KEY = "test-key";
    const spy = mockZernio();

    const out = await fetchAnalytics({
      accountId: "acc_1",
      platform: "INSTAGRAM",
      from: new Date("2026-07-01"),
      to: new Date("2026-07-02"),
    });

    // Ogni chiamata verso Zernio porta il Bearer.
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toContain(ZERNIO_BASE);
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer test-key"
    );

    // Account/giorno: 2 giorni, followers da follower-stats.
    expect(out.account).toHaveLength(2);
    expect(out.account[0].followers).toBe(1000);
    expect(out.account[1].followers).toBe(1025);
    // engagement_rate in PERCENTUALE: (540+62+130+44)/9000*100 ≈ 8.62.
    expect(out.account[0].engagementRate).toBeCloseTo(8.62, 1);
    // non_follower_pct solo sull'ultima riga: 7400/18500*100 = 40.
    expect(out.account[0].nonFollowerPct).toBeNull();
    expect(out.account[1].nonFollowerPct).toBeCloseTo(40, 5);

    // Demografiche: country → geo.
    const dims = new Set(out.demographics.map((d) => d.dimension));
    expect(dims).toEqual(new Set(["age", "gender", "geo"]));
    expect(out.demographics.find((d) => d.dimension === "geo")?.label).toBe("IT");

    // Per-post: externalId = latePostId, comments mappati.
    expect(out.posts).toHaveLength(1);
    expect(out.posts[0].externalId).toBe("post_ext_1");
    expect(out.posts[0].comments).toBe(62);
  });
});
