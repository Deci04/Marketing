import { describe, it, expect, vi, beforeEach } from "vitest";

const { setCredentials, refreshAccessToken, MockOAuth2, account, config } =
  vi.hoisted(() => {
    const setCredentials = vi.fn();
    const refreshAccessToken = vi.fn(async () => ({
      credentials: { access_token: "fresh", expiry_date: Date.now() + 3600_000 },
    }));
    class MockOAuth2 {
      credentials: Record<string, unknown> = {};
      setCredentials = setCredentials;
      refreshAccessToken = refreshAccessToken;
    }
    return {
      setCredentials,
      refreshAccessToken,
      MockOAuth2,
      account: { findFirst: vi.fn(), update: vi.fn() },
      config: { findUnique: vi.fn() },
    };
  });

vi.mock("googleapis", () => ({
  google: { auth: { OAuth2: MockOAuth2 }, calendar: vi.fn() },
}));
vi.mock("@/lib/db", () => ({
  db: { account, googleCalendarConfig: config },
}));

import { getAuthClient } from "@/lib/google-calendar";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.GOOGLE_CLIENT_ID = "id";
  process.env.GOOGLE_CLIENT_SECRET = "secret";
});

describe("getAuthClient", () => {
  it("ritorna null se il workspace non è collegato", async () => {
    config.findUnique.mockResolvedValue(null);
    expect(await getAuthClient("ws1")).toBeNull();
  });

  it("refresha e ripersiste quando il token è scaduto", async () => {
    config.findUnique.mockResolvedValue({ connectedByUserId: "u1" });
    account.findFirst.mockResolvedValue({
      id: "acc1",
      access_token: "stale",
      refresh_token: "r1",
      expires_at: Math.floor(Date.now() / 1000) - 100, // passato
    });
    const client = await getAuthClient("ws1");
    expect(refreshAccessToken).toHaveBeenCalled();
    expect(account.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "acc1" } })
    );
    expect(client).not.toBeNull();
  });

  it("ritorna null se GOOGLE_CLIENT_ID/SECRET mancano (degrado silenzioso)", async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    expect(await getAuthClient("ws1")).toBeNull();
  });
});
