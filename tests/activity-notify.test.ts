import { describe, it, expect, vi, beforeEach } from "vitest";

const { membership, user, content, chatIdForUser, sendMessage } = vi.hoisted(() => ({
  membership: { findMany: vi.fn() },
  user: { findUnique: vi.fn() },
  content: { findFirst: vi.fn() },
  chatIdForUser: vi.fn(),
  sendMessage: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: { membership, user, content } }));
vi.mock("@/lib/telegram-link", () => ({ chatIdForUser }));
vi.mock("@/lib/telegram", () => ({ sendMessage }));

import { notifyTelegramForActivity } from "@/lib/activity";
import type { ActivityType } from "@prisma/client";

const WS = "ws1";
const ACTOR = "luca"; // chi genera l'evento
const OTHER = "matteo"; // l'altro membro, destinatario

function activity(type: ActivityType, over: Partial<{ contentId: string | null; actorId: string | null }> = {}) {
  return { workspaceId: WS, type, contentId: "c1", actorId: ACTOR, ...over };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Workspace a 2: actor + l'altro. La query deve escludere l'actor,
  // quindi il default restituisce solo "l'altro".
  membership.findMany.mockResolvedValue([{ userId: OTHER }]);
  user.findUnique.mockResolvedValue({ name: "Luca", email: "luca@t.it" });
  content.findFirst.mockResolvedValue({ title: "Reel prodotto X" });
  chatIdForUser.mockResolvedValue("chat_matteo");
  sendMessage.mockResolvedValue(undefined);
});

describe("notifyTelegramForActivity", () => {
  it("CREATED non invia alcuna notifica push (solo campanella)", async () => {
    await notifyTelegramForActivity(activity("CREATED"));
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("un tipo non-push non invia", async () => {
    await notifyTelegramForActivity(activity("CREATED"));
    // e nemmeno interroga i destinatari
    expect(membership.findMany).not.toHaveBeenCalled();
  });

  it("DELIVERED notifica l'altro membro con titolo + link", async () => {
    await notifyTelegramForActivity(activity("DELIVERED"));
    expect(sendMessage).toHaveBeenCalledTimes(1);
    const [chatId, text] = sendMessage.mock.calls[0];
    expect(chatId).toBe("chat_matteo");
    expect(text).toContain("Luca");
    expect(text).toContain("consegnato");
    expect(text).toContain("«Reel prodotto X»");
    expect(text).toContain("/contenuti/c1");
  });

  it("REVIEW_READY, CONFIRMED e COMMENT inviano tutti", async () => {
    for (const t of ["REVIEW_READY", "CONFIRMED", "COMMENT"] as ActivityType[]) {
      sendMessage.mockClear();
      await notifyTelegramForActivity(activity(t));
      expect(sendMessage).toHaveBeenCalledTimes(1);
    }
  });

  it("la query destinatari esclude l'actor (scopedWhere + userId not)", async () => {
    await notifyTelegramForActivity(activity("DELIVERED"));
    const arg = membership.findMany.mock.calls[0][0];
    expect(arg.where.workspaceId).toBe(WS);
    expect(arg.where.userId).toEqual({ not: ACTOR });
  });

  it("l'actor non riceve nulla se è l'unico membro con chat", async () => {
    // Simula: la query (che esclude l'actor) non restituisce nessuno.
    membership.findMany.mockResolvedValue([]);
    await notifyTelegramForActivity(activity("DELIVERED"));
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("destinatario senza chatId collegato = nessun invio", async () => {
    chatIdForUser.mockResolvedValue(null);
    await notifyTelegramForActivity(activity("DELIVERED"));
    expect(chatIdForUser).toHaveBeenCalledWith(OTHER);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("senza contentId: manda comunque il testo, senza link", async () => {
    await notifyTelegramForActivity(activity("COMMENT", { contentId: null }));
    expect(content.findFirst).not.toHaveBeenCalled();
    const [, text] = sendMessage.mock.calls[0];
    expect(text).not.toContain("/contenuti/");
  });

  it("con NEXT_PUBLIC_APP_URL usa un URL assoluto", async () => {
    const prev = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com/";
    await notifyTelegramForActivity(activity("DELIVERED"));
    const [, text] = sendMessage.mock.calls[0];
    expect(text).toContain("https://app.example.com/contenuti/c1");
    if (prev === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = prev;
  });

  it("non lancia mai: se il lookup destinatari fallisce resta best-effort", async () => {
    membership.findMany.mockRejectedValue(new Error("db down"));
    await expect(notifyTelegramForActivity(activity("DELIVERED"))).resolves.toBeUndefined();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("multi-destinatario: invia a ciascun membro con chat", async () => {
    membership.findMany.mockResolvedValue([{ userId: "matteo" }, { userId: "sara" }]);
    await notifyTelegramForActivity(activity("DELIVERED"));
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });
});
