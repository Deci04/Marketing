import { describe, it, expect, vi, afterEach } from "vitest";
import { getConnectUrl, getDefaultProfileId, ZERNIO_BASE } from "@/lib/zernio";

afterEach(() => vi.restoreAllMocks());

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200 });

describe("getConnectUrl", () => {
  it("risolve il profileId da /accounts e chiama /connect/{platform} (redirect_url) col Bearer", async () => {
    process.env.ZERNIO_API_KEY = "test-key";
    const redirect = "https://app.example/api/integrations/zernio/callback";

    const spy = vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/accounts")) {
        // profileId è oneOf string | Profile{_id}: qui l'oggetto.
        return json({
          accounts: [
            { _id: "acc_1", platform: "instagram", profileId: { _id: "prof_1" } },
          ],
          hasAnalyticsAccess: true,
        });
      }
      return json({ authUrl: "https://zernio.com/oauth/xyz" });
    });

    const url = await getConnectUrl("INSTAGRAM", redirect);

    // Prima chiamata: /accounts per il profileId. Seconda: /connect/{platform}.
    const connectCall = spy.mock.calls.find((c) =>
      String(c[0]).includes("/connect/")
    );
    expect(connectCall).toBeDefined();
    const [reqUrl, init] = connectCall!;
    // Path reale: /connect/{platform} lowercase, con profileId + redirect_url.
    expect(String(reqUrl)).toBe(
      `${ZERNIO_BASE}/connect/instagram?profileId=prof_1&redirect_url=${encodeURIComponent(
        redirect
      )}`
    );
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer test-key"
    );
    expect(url).toBe("https://zernio.com/oauth/xyz");
  });

  it("getDefaultProfileId ritorna null se non ci sono account collegati", async () => {
    process.env.ZERNIO_API_KEY = "test-key";
    vi.spyOn(global, "fetch").mockResolvedValue(
      json({ accounts: [], hasAnalyticsAccess: true })
    );
    expect(await getDefaultProfileId()).toBeNull();
  });
});
