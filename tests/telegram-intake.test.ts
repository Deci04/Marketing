import { describe, it, expect, afterAll } from "vitest";
import { db } from "@/lib/db";
import { handleTelegramUpdate } from "@/lib/telegram-intake";
import type { TelegramUpdate } from "@/lib/telegram";

const ws = { id: `ws_intake_${Date.now()}`, name: "intake" };
const chatId = "555777";
let userId = "";

const noopTg = { sendMessage: async () => {}, getFilePath: async () => null, downloadFile: async () => null };

describe("handleTelegramUpdate", () => {
  it("collega la chat con /start <code>", async () => {
    await db.workspace.create({ data: ws });
    const u = await db.user.create({
      data: { email: `i_${Date.now()}@t.it`, telegramLinkCode: "CODE42" },
    });
    userId = u.id;
    await db.membership.create({ data: { userId: u.id, workspaceId: ws.id, role: "COLLABORATOR" } });

    const upd: TelegramUpdate = { message: { chat: { id: Number(chatId) }, text: "/start CODE42" } };
    const r = await handleTelegramUpdate(upd, { ...noopTg });
    expect(r.status).toBe("linked");
    const reread = await db.user.findUnique({ where: { id: u.id } });
    expect(reread?.telegramChatId).toBe(chatId);
  });

  it("salva un DiaryEntry testuale nel workspace mappato", async () => {
    const upd: TelegramUpdate = { message: { chat: { id: Number(chatId) }, text: "girato il reel" } };
    const r = await handleTelegramUpdate(upd, { ...noopTg });
    expect(r.status).toBe("saved");
    const entries = await db.diaryEntry.findMany({ where: { workspaceId: ws.id } });
    expect(entries.some((e) => e.rawText === "girato il reel")).toBe(true);
  });

  it("per una foto salva SOLO file_id + descrizione vision (nessun byte)", async () => {
    const upd: TelegramUpdate = {
      message: { chat: { id: Number(chatId) }, caption: "backstage", photo: [{ file_id: "small" }, { file_id: "big" }] },
    };
    const r = await handleTelegramUpdate(upd, {
      sendMessage: async () => {},
      getFilePath: async () => "photos/x.jpg",
      downloadFile: async () => new Uint8Array([1, 2, 3]),
      describePhoto: async () => ({ aiTitle: "Backstage", aiDescription: "set di ripresa" }),
    });
    expect(r.status).toBe("saved");
    const photo = (await db.diaryEntry.findMany({ where: { workspaceId: ws.id } })).find(
      (e) => e.telegramFileType === "photo"
    );
    expect(photo?.telegramFileId).toBe("big"); // la size più grande = ultimo elemento
    expect(photo?.aiDescription).toBe("set di ripresa");
  });

  it("ignora una chat non mappata", async () => {
    const upd: TelegramUpdate = { message: { chat: { id: 424242 }, text: "ciao" } };
    const r = await handleTelegramUpdate(upd, { ...noopTg });
    expect(r.status).toBe("ignored");
  });

  afterAll(async () => {
    await db.diaryEntry.deleteMany({ where: { workspaceId: ws.id } }).catch(() => {});
    await db.user.deleteMany({ where: { id: userId } }).catch(() => {});
    await db.workspace.delete({ where: { id: ws.id } }).catch(() => {});
  });
});
