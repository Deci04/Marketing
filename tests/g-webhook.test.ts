import { describe, it, expect, vi, beforeEach } from "vitest";

const { findFirst, pullChanges } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  pullChanges: vi.fn(async () => {}),
}));

vi.mock("@/lib/db", () => ({
  db: { googleCalendarConfig: { findFirst } },
}));
vi.mock("@/lib/google-calendar", () => ({ pullChanges }));

import { POST } from "@/app/api/integrations/google/webhook/route";

function req(headers: Record<string, string>) {
  return new Request("https://x.test/api/integrations/google/webhook", {
    method: "POST",
    headers,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.GOOGLE_WEBHOOK_TOKEN;
});

describe("google webhook (no session, secret header)", () => {
  it("header channel-id mancante → 200 senza pull", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(200);
    expect(pullChanges).not.toHaveBeenCalled();
  });

  it("canale sconosciuto → 200 senza pull", async () => {
    findFirst.mockResolvedValue(null);
    const res = await POST(req({ "x-goog-channel-id": "ch1" }));
    expect(res.status).toBe(200);
    expect(pullChanges).not.toHaveBeenCalled();
  });

  it("resource-state=sync (handshake) → 200 senza pull", async () => {
    findFirst.mockResolvedValue({ workspaceId: "ws1", channelId: "ch1" });
    const res = await POST(
      req({ "x-goog-channel-id": "ch1", "x-goog-resource-state": "sync" })
    );
    expect(res.status).toBe(200);
    expect(pullChanges).not.toHaveBeenCalled();
  });

  it("canale valido + state=exists → pullChanges(cfg.workspaceId)", async () => {
    findFirst.mockResolvedValue({ workspaceId: "ws1", channelId: "ch1" });
    const res = await POST(
      req({ "x-goog-channel-id": "ch1", "x-goog-resource-state": "exists" })
    );
    expect(res.status).toBe(200);
    expect(pullChanges).toHaveBeenCalledWith("ws1");
  });

  it("secret token errato → 200 senza pull", async () => {
    process.env.GOOGLE_WEBHOOK_TOKEN = "s3cr3t";
    findFirst.mockResolvedValue({ workspaceId: "ws1", channelId: "ch1" });
    const res = await POST(
      req({
        "x-goog-channel-id": "ch1",
        "x-goog-resource-state": "exists",
        "x-goog-channel-token": "wrong",
      })
    );
    expect(res.status).toBe(200);
    expect(pullChanges).not.toHaveBeenCalled();
  });
});
