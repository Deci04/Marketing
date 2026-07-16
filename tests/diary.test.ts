import { describe, it, expect, afterAll } from "vitest";
import { db } from "@/lib/db";
import { createDiaryEntry, searchDiaryEntries } from "@/lib/diary";

const ws = { id: `ws_diary_${Date.now()}`, name: "diarytest" };

describe("diary data layer", () => {
  it("crea e cerca voci di diario, scoping al workspace", async () => {
    await db.workspace.create({ data: ws });
    await createDiaryEntry(ws.id, { rawText: "girato reel in spiaggia" });
    await createDiaryEntry(ws.id, {
      caption: "tramonto",
      mediaType: "photo",
      aiDescription: "una spiaggia al tramonto con onde",
    });

    const all = await searchDiaryEntries(ws.id);
    expect(all.length).toBe(2);

    const hit = await searchDiaryEntries(ws.id, { query: "spiaggia" });
    // match sia su rawText che su aiDescription
    expect(hit.length).toBe(2);

    const reel = await searchDiaryEntries(ws.id, { query: "reel" });
    expect(reel.length).toBe(1);
  });

  it("persiste i campi media R2 (nuovo canale in-app)", async () => {
    const entry = await createDiaryEntry(ws.id, {
      rawText: "nota con foto",
      r2Key: "raw/ws/eid/foto.png",
      mediaUrl: "/api/diario/media/raw/ws/eid/foto.png",
      mediaType: "image",
      mediaSize: 12345,
    });
    expect(entry.r2Key).toBe("raw/ws/eid/foto.png");
    expect(entry.mediaType).toBe("image");
    expect(entry.mediaSize).toBe(12345);
    const back = await db.diaryEntry.findUnique({ where: { id: entry.id } });
    expect(back?.mediaUrl).toBe("/api/diario/media/raw/ws/eid/foto.png");
  });

  afterAll(async () => {
    await db.diaryEntry.deleteMany({ where: { workspaceId: ws.id } }).catch(() => {});
    await db.workspace.delete({ where: { id: ws.id } }).catch(() => {});
  });
});
