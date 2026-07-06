import { describe, it, expect, vi, beforeEach } from "vitest";

const { syncItemOut, deleteItemOut, content, block, calendarEvent } = vi.hoisted(
  () => ({
    syncItemOut: vi.fn(async () => {}),
    deleteItemOut: vi.fn(async () => {}),
    content: {
      findFirst: vi.fn(async () => ({ id: "c1" })),
      create: vi.fn(async () => ({ id: "c1" })),
      update: vi.fn(async () => ({ id: "c1" })),
      delete: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({})),
    },
    block: {
      findFirst: vi.fn(async () => ({ id: "b1" })),
      update: vi.fn(async () => ({ id: "b1" })),
      create: vi.fn(async () => ({ id: "b1" })),
    },
    calendarEvent: {
      findFirst: vi.fn(async () => ({ id: "e1" })),
      create: vi.fn(async () => ({ id: "e1" })),
      update: vi.fn(async () => ({ id: "e1" })),
      delete: vi.fn(async () => ({})),
    },
  })
);

vi.mock("@/lib/google-calendar", () => ({ syncItemOut, deleteItemOut }));
vi.mock("@/lib/db", () => ({
  db: {
    content,
    block,
    calendarEvent,
    comment: { deleteMany: vi.fn() },
    contentClass: { findMany: vi.fn(async () => []) },
  },
}));
vi.mock("@/lib/workspace", () => ({
  scopedWhere: (w: string, x: object = {}) => ({ ...x, workspaceId: w }),
}));

import { createContent, updateContent, deleteContent } from "@/lib/content";
import {
  addEvent,
  moveItem,
  deleteItem,
  setBlockDelivery,
  createBlockRange,
} from "@/lib/calendar";

beforeEach(() => vi.clearAllMocks());

describe("content.ts chokepoints", () => {
  it("createContent con publishAt → syncItemOut publication", async () => {
    await createContent("ws1", {
      title: "t",
      channel: "INSTAGRAM" as never,
      publishAt: new Date(),
    });
    expect(syncItemOut).toHaveBeenCalledWith("ws1", "publication", "c1");
  });

  it("createContent senza publishAt → nessuna push", async () => {
    await createContent("ws1", { title: "t", channel: "INSTAGRAM" as never });
    expect(syncItemOut).not.toHaveBeenCalled();
  });

  it("updateContent con publishAt=null → deleteItemOut", async () => {
    await updateContent("ws1", "c1", { publishAt: null });
    expect(deleteItemOut).toHaveBeenCalledWith("ws1", "publication", "c1");
  });

  it("updateContent con publishAt valorizzato → syncItemOut", async () => {
    await updateContent("ws1", "c1", { publishAt: new Date() });
    expect(syncItemOut).toHaveBeenCalledWith("ws1", "publication", "c1");
  });

  it("updateContent senza publishAt → nessuna sync", async () => {
    await updateContent("ws1", "c1", { title: "x" });
    expect(syncItemOut).not.toHaveBeenCalled();
    expect(deleteItemOut).not.toHaveBeenCalled();
  });

  it("deleteContent → deleteItemOut prima della delete", async () => {
    await deleteContent("ws1", "c1");
    expect(deleteItemOut).toHaveBeenCalledWith("ws1", "publication", "c1");
  });
});

describe("calendar.ts chokepoints", () => {
  it("addEvent → syncItemOut event", async () => {
    await addEvent("ws1", { date: new Date(), title: "T" });
    expect(syncItemOut).toHaveBeenCalledWith("ws1", "event", "e1");
  });

  it("setBlockDelivery → syncItemOut con who come refType", async () => {
    await setBlockDelivery("ws1", "b1", "luca", new Date());
    expect(syncItemOut).toHaveBeenCalledWith("ws1", "luca", "b1");
  });

  it("moveItem publication → syncItemOut publication", async () => {
    await moveItem("ws1", "publication", "c1", new Date());
    expect(syncItemOut).toHaveBeenCalledWith("ws1", "publication", "c1");
  });

  it("moveItem event → syncItemOut event", async () => {
    await moveItem("ws1", "event", "e1", new Date());
    expect(syncItemOut).toHaveBeenCalledWith("ws1", "event", "e1");
  });

  it("deleteItem event → deleteItemOut event", async () => {
    await deleteItem("ws1", "event", "e1");
    expect(deleteItemOut).toHaveBeenCalledWith("ws1", "event", "e1");
  });

  it("deleteItem matteo (data azzerata) → deleteItemOut matteo", async () => {
    await deleteItem("ws1", "matteo", "b1");
    expect(deleteItemOut).toHaveBeenCalledWith("ws1", "matteo", "b1");
  });

  it("createBlockRange → syncItemOut per luca e matteo", async () => {
    await createBlockRange("ws1", {
      label: "L",
      startDate: new Date(),
      endDate: new Date(),
    });
    expect(syncItemOut).toHaveBeenCalledWith("ws1", "luca", "b1");
    expect(syncItemOut).toHaveBeenCalledWith("ws1", "matteo", "b1");
  });
});
