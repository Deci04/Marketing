import { describe, it, expect, afterAll } from "vitest";
import { db } from "@/lib/db";
import { readOnlyTools } from "@/lib/chat-tools";
import { createDiaryEntry } from "@/lib/diary";

const ws = { id: `ws_dtool_${Date.now()}`, name: "dtool" };

describe("searchDiary tool", () => {
  it("è registrato e restituisce le voci del workspace", async () => {
    await db.workspace.create({ data: ws });
    await createDiaryEntry(ws.id, { rawText: "idea per un carosello" });
    const tools = readOnlyTools(ws.id);
    expect(tools.searchDiary).toBeDefined();
    const out = await tools.searchDiary.execute!(
      { query: "carosello" },
      { toolCallId: "t", messages: [] } as never
    );
    expect(Array.isArray(out)).toBe(true);
    expect((out as Array<{ text: string | null }>)[0].text).toContain("carosello");
  });

  afterAll(async () => {
    await db.diaryEntry.deleteMany({ where: { workspaceId: ws.id } }).catch(() => {});
    await db.workspace.delete({ where: { id: ws.id } }).catch(() => {});
  });
});
