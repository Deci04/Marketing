import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

vi.mock("@/lib/current", () => ({ currentContext: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/r2", () => ({
  deleteObject: vi.fn(async () => {}),
  isConfigured: vi.fn(() => false),
}));

import { currentContext } from "@/lib/current";
import { db } from "@/lib/db";
import { createDiaryEntry } from "@/lib/diary";
import { deleteDiaryEntryAction } from "@/app/(app)/diario/actions";

const ws = { id: `ws_del_${Date.now()}`, name: "deltest" };
const setCtx = (userId: string, isAdmin: boolean) =>
  vi.mocked(currentContext).mockResolvedValue({
    workspaceId: ws.id,
    user: { id: userId, isAdmin },
  } as never);

describe("deleteDiaryEntryAction", () => {
  beforeAll(async () => {
    await db.workspace.create({ data: ws });
  });
  afterAll(async () => {
    await db.diaryEntry.deleteMany({ where: { workspaceId: ws.id } }).catch(() => {});
    await db.workspace.delete({ where: { id: ws.id } }).catch(() => {});
  });

  it("l'autore può eliminare il proprio messaggio", async () => {
    const e = await createDiaryEntry(ws.id, { authorUserId: "u1", rawText: "ciao" });
    setCtx("u1", false);
    const res = await deleteDiaryEntryAction(e.id);
    expect(res.ok).toBe(true);
    expect(await db.diaryEntry.findUnique({ where: { id: e.id } })).toBeNull();
  });

  it("un non-autore non-admin NON può eliminare", async () => {
    const e = await createDiaryEntry(ws.id, { authorUserId: "u1", rawText: "mio" });
    setCtx("u2", false);
    const res = await deleteDiaryEntryAction(e.id);
    expect(res.ok).toBe(false);
    expect(await db.diaryEntry.findUnique({ where: { id: e.id } })).not.toBeNull();
  });

  it("un admin può eliminare il messaggio altrui", async () => {
    const e = await createDiaryEntry(ws.id, { authorUserId: "u1", rawText: "x" });
    setCtx("u2", true);
    const res = await deleteDiaryEntryAction(e.id);
    expect(res.ok).toBe(true);
    expect(await db.diaryEntry.findUnique({ where: { id: e.id } })).toBeNull();
  });
});
