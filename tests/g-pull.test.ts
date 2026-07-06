import { describe, it, expect, vi, beforeEach } from "vitest";

const { list, link, config, calendarEvent, content } = vi.hoisted(() => ({
  list: vi.fn(),
  link: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
  },
  config: {
    findUnique: vi.fn(async () => ({
      calendarId: "cal1",
      syncToken: null,
      connectedByUserId: "u1",
    })),
    update: vi.fn(),
  },
  calendarEvent: {
    create: vi.fn(async () => ({ id: "ce1" })),
    update: vi.fn(),
    delete: vi.fn(),
  },
  content: { update: vi.fn(), findFirst: vi.fn() },
}));

vi.mock("googleapis", () => ({
  google: {
    calendar: () => ({ events: { list } }),
    auth: { OAuth2: class { setCredentials() {} } },
  },
}));
vi.mock("@/lib/db", () => ({
  db: {
    googleCalendarConfig: config,
    googleCalendarLink: link,
    calendarEvent,
    content,
    account: {
      findFirst: vi.fn(async () => ({
        id: "a",
        refresh_token: "r",
        expires_at: 9e12,
      })),
    },
  },
}));

import { pullChanges } from "@/lib/google-calendar";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.GOOGLE_CLIENT_ID = "id";
  process.env.GOOGLE_CLIENT_SECRET = "secret";
});

it("evento con link publication → content.update publishAt + salva syncToken", async () => {
  list.mockResolvedValue({
    data: {
      nextSyncToken: "tok2",
      items: [
        {
          id: "gev1",
          status: "confirmed",
          summary: "[Matteo] Uscita",
          start: { date: "2026-07-09" },
          etag: "e2",
        },
      ],
    },
  });
  link.findFirst.mockResolvedValue({
    id: "l1",
    refType: "publication",
    refId: "c1",
    etag: "e1",
  });
  await pullChanges("ws1");
  expect(content.update).toHaveBeenCalledWith({
    where: { id: "c1" },
    data: { publishAt: new Date("2026-07-09T00:00:00.000Z") },
  });
  expect(config.update).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ syncToken: "tok2" }) })
  );
});

it("evento cancelled con link event → calendarEvent.delete + link.delete", async () => {
  list.mockResolvedValue({
    data: {
      nextSyncToken: "tok3",
      items: [{ id: "gevC", status: "cancelled" }],
    },
  });
  link.findFirst.mockResolvedValue({
    id: "l2",
    refType: "event",
    refId: "ceX",
  });
  await pullChanges("ws1");
  expect(calendarEvent.delete).toHaveBeenCalledWith({ where: { id: "ceX" } });
  expect(link.delete).toHaveBeenCalledWith({ where: { id: "l2" } });
});

it("self-originated (refId in extendedProperties) arrivato prima del link → nessun CalendarEvent spurio", async () => {
  list.mockResolvedValue({
    data: {
      nextSyncToken: "tokS",
      items: [
        {
          id: "gevSelf",
          status: "confirmed",
          summary: "[Matteo] Uscita",
          start: { date: "2026-07-11" },
          etag: "eSelf",
          extendedProperties: {
            private: { refType: "publication", refId: "c1" },
          },
        },
      ],
    },
  });
  link.findFirst.mockResolvedValue(null); // link non ancora committato (race)
  content.findFirst.mockResolvedValue({ id: "c1" }); // entità già esistente
  await pullChanges("ws1");
  // Non deve creare un CalendarEvent duplicato: adotta il link sull'entità esistente.
  expect(calendarEvent.create).not.toHaveBeenCalled();
  expect(link.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        workspaceId_refType_refId: {
          workspaceId: "ws1",
          refType: "publication",
          refId: "c1",
        },
      },
    })
  );
});

it("evento nuovo taggato → CalendarEvent non-null responsible + link", async () => {
  list.mockResolvedValue({
    data: {
      nextSyncToken: "tok2",
      items: [
        {
          id: "gevX",
          status: "confirmed",
          summary: "[Luca] Shooting",
          start: { date: "2026-07-10" },
          etag: "e9",
        },
      ],
    },
  });
  link.findFirst.mockResolvedValue(null);
  await pullChanges("ws1");
  expect(calendarEvent.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ responsible: "LUCA", workspaceId: "ws1" }),
    })
  );
  expect(link.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ refType: "event", googleEventId: "gevX" }),
    })
  );
  expect(config.update).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ syncToken: "tok2" }) })
  );
});
