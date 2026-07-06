import { describe, it, expect, afterAll } from "vitest";
import { db } from "@/lib/db";
import {
  setTelegramLinkCode,
  linkTelegramChat,
  resolveWorkspaceForChat,
  chatIdForUser,
} from "@/lib/telegram-link";

const ws = { id: `ws_link_${Date.now()}`, name: "linktest" };
let userId = "";

describe("telegram-link", () => {
  it("collega una chat via codice e la risolve al workspace", async () => {
    await db.workspace.create({ data: ws });
    const u = await db.user.create({ data: { email: `l_${Date.now()}@t.it` } });
    userId = u.id;
    await db.membership.create({
      data: { userId: u.id, workspaceId: ws.id, role: "COLLABORATOR" },
    });

    const code = await setTelegramLinkCode(u.id);
    expect(code).toMatch(/\w{4,}/);

    const linked = await linkTelegramChat(code, "999001");
    expect(linked.ok).toBe(true);

    const resolved = await resolveWorkspaceForChat("999001");
    expect(resolved?.workspaceId).toBe(ws.id);
    expect(resolved?.userId).toBe(u.id);

    expect(await chatIdForUser(u.id)).toBe("999001");

    // codice consumato → non più valido
    const again = await linkTelegramChat(code, "999002");
    expect(again.ok).toBe(false);
  });

  afterAll(async () => {
    await db.user.deleteMany({ where: { id: userId } }).catch(() => {});
    await db.workspace.delete({ where: { id: ws.id } }).catch(() => {});
  });
});
