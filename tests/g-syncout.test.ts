import { describe, it, expect, vi, beforeEach } from "vitest";

const { events, link, content } = vi.hoisted(() => ({
  events: {
    insert: vi.fn(async () => ({ data: { id: "gev1", etag: "e1" } })),
    patch: vi.fn(async () => ({ data: { id: "gev1", etag: "e2" } })),
    delete: vi.fn(async () => ({})),
  },
  link: { findUnique: vi.fn(), upsert: vi.fn(), delete: vi.fn() },
  content: { findFirst: vi.fn() },
}));

vi.mock("googleapis", () => ({
  google: {
    calendar: () => ({ events }),
    auth: { OAuth2: class { setCredentials() {} } },
  },
}));
vi.mock("@/lib/db", () => ({
  db: {
    googleCalendarConfig: {
      findUnique: vi.fn(async () => ({
        calendarId: "cal1",
        connectedByUserId: "u1",
      })),
    },
    account: {
      findFirst: vi.fn(async () => ({
        id: "a",
        refresh_token: "r",
        expires_at: 9e12,
      })),
    },
    googleCalendarLink: link,
    content,
    block: {},
    calendarEvent: {},
  },
}));

import * as gc from "@/lib/google-calendar";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.GOOGLE_CLIENT_ID = "id";
  process.env.GOOGLE_CLIENT_SECRET = "secret";
});

describe("syncItemOut idempotente", () => {
  it("insert quando non c'è link, poi upsert con googleEventId", async () => {
    link.findUnique.mockResolvedValue(null);
    content.findFirst.mockResolvedValue({
      id: "c1",
      title: "Uscita",
      publishAt: new Date("2026-07-04T00:00:00Z"),
    });
    await gc.syncItemOut("ws1", "publication", "c1");
    expect(events.insert).toHaveBeenCalledOnce();
    expect(events.patch).not.toHaveBeenCalled();
    expect(link.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ googleEventId: "gev1" }),
      })
    );
  });

  it("patch quando il link esiste già", async () => {
    link.findUnique.mockResolvedValue({
      googleEventId: "gev1",
      etag: "e1",
      googleCalendarId: "cal1",
    });
    content.findFirst.mockResolvedValue({
      id: "c1",
      title: "Uscita 2",
      publishAt: new Date("2026-07-05T00:00:00Z"),
    });
    await gc.syncItemOut("ws1", "publication", "c1");
    expect(events.patch).toHaveBeenCalledOnce();
    expect(events.insert).not.toHaveBeenCalled();
  });

  it("conflitto 412 → re-patch SENZA If-Match (no insert, no duplicato)", async () => {
    link.findUnique.mockResolvedValue({
      googleEventId: "gev1",
      etag: "stale",
      googleCalendarId: "cal1",
    });
    content.findFirst.mockResolvedValue({
      id: "c1",
      title: "Uscita conflitto",
      publishAt: new Date("2026-07-06T00:00:00Z"),
    });
    // Il primo patch (con If-Match) fallisce 412 = etag stale.
    events.patch.mockRejectedValueOnce({ response: { status: 412 } });
    await gc.syncItemOut("ws1", "publication", "c1");
    // Due patch, nessun insert → niente evento duplicato/orfano.
    expect(events.patch).toHaveBeenCalledTimes(2);
    expect(events.insert).not.toHaveBeenCalled();
    const calls = events.patch.mock.calls as unknown as Array<
      [{ headers?: Record<string, string>; calendarId: string; eventId: string }]
    >;
    const firstCall = calls[0][0];
    const secondCall = calls[1][0];
    expect(firstCall.headers).toEqual({ "If-Match": "stale" });
    expect(secondCall.headers).toBeUndefined(); // re-patch last-write-wins
    expect(secondCall).toMatchObject({ calendarId: "cal1", eventId: "gev1" });
    expect(link.upsert).toHaveBeenCalled();
  });

  it("degrada in silenzio se non collegato (nessun throw)", async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    await expect(
      gc.syncItemOut("ws1", "publication", "c1")
    ).resolves.toBeUndefined();
    expect(events.insert).not.toHaveBeenCalled();
    expect(events.patch).not.toHaveBeenCalled();
  });
});

describe("deleteItemOut", () => {
  it("cancella l'evento e rimuove il link", async () => {
    link.findUnique.mockResolvedValue({
      id: "l1",
      googleEventId: "gev1",
      googleCalendarId: "cal1",
    });
    await gc.deleteItemOut("ws1", "event", "e1");
    expect(events.delete).toHaveBeenCalledOnce();
    expect(link.delete).toHaveBeenCalledWith({ where: { id: "l1" } });
  });

  it("no-op se non esiste link", async () => {
    link.findUnique.mockResolvedValue(null);
    await gc.deleteItemOut("ws1", "event", "e1");
    expect(events.delete).not.toHaveBeenCalled();
    expect(link.delete).not.toHaveBeenCalled();
  });
});
