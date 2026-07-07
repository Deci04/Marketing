import { describe, it, expect, afterAll } from "vitest";
import { db } from "@/lib/db";
import { createDiaryEntry, searchDiaryEntries } from "@/lib/diary";

const ws = { id: `ws_diary_${Date.now()}`, name: "diarytest" };

describe("diary data layer", () => {
  it("crea e cerca voci di diario, scoping al workspace", async () => {
    await db.workspace.create({ data: ws });
    await createDiaryEntry(ws.id, { rawText: "girato reel in spiaggia", telegramFileType: null });
    await createDiaryEntry(ws.id, {
      caption: "tramonto",
      telegramFileId: "AgAC1",
      telegramFileType: "photo",
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

  afterAll(async () => {
    await db.diaryEntry.deleteMany({ where: { workspaceId: ws.id } }).catch(() => {});
    await db.workspace.delete({ where: { id: ws.id } }).catch(() => {});
  });
});
