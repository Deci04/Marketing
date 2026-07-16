import { describe, it, expect, vi, beforeEach } from "vitest";

const { membership, user, content, isPushConfigured, sendPushToUser } = vi.hoisted(() => ({
  membership: { findMany: vi.fn() },
  user: { findUnique: vi.fn() },
  content: { findFirst: vi.fn() },
  isPushConfigured: vi.fn(),
  sendPushToUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: { membership, user, content } }));
vi.mock("@/lib/web-push", () => ({ isPushConfigured, sendPushToUser }));

import { notifyWebPushForActivity } from "@/lib/activity";
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
  isPushConfigured.mockReturnValue(true);
  membership.findMany.mockResolvedValue([{ userId: OTHER }]);
  user.findUnique.mockResolvedValue({ name: "Luca", email: "luca@t.it" });
  content.findFirst.mockResolvedValue({ title: "Reel prodotto X" });
  sendPushToUser.mockResolvedValue(undefined);
});

describe("notifyWebPushForActivity", () => {
  it("no-op totale se il push non è configurato (VAPID assente)", async () => {
    isPushConfigured.mockReturnValue(false);
    await notifyWebPushForActivity(activity("DELIVERED"));
    expect(membership.findMany).not.toHaveBeenCalled();
    expect(sendPushToUser).not.toHaveBeenCalled();
  });

  it("CREATED non invia alcuna notifica push (solo campanella)", async () => {
    await notifyWebPushForActivity(activity("CREATED"));
    expect(sendPushToUser).not.toHaveBeenCalled();
  });

  it("un tipo non-push non invia", async () => {
    await notifyWebPushForActivity(activity("CREATED"));
    // e nemmeno interroga i destinatari
    expect(membership.findMany).not.toHaveBeenCalled();
  });

  it("DELIVERED notifica l'altro membro con titolo + link", async () => {
    await notifyWebPushForActivity(activity("DELIVERED"));
    expect(sendPushToUser).toHaveBeenCalledTimes(1);
    const [userId, payload] = sendPushToUser.mock.calls[0];
    expect(userId).toBe(OTHER);
    expect(payload.title).toBeTruthy();
    expect(payload.body).toContain("Luca");
    expect(payload.body).toContain("consegnato");
    expect(payload.body).toContain("«Reel prodotto X»");
    expect(payload.body).toContain("/contenuti/c1");
    expect(payload.url).toContain("/contenuti/c1");
  });

  it("REVIEW_READY, CONFIRMED e COMMENT inviano tutti", async () => {
    for (const t of ["REVIEW_READY", "CONFIRMED", "COMMENT"] as ActivityType[]) {
      sendPushToUser.mockClear();
      await notifyWebPushForActivity(activity(t));
      expect(sendPushToUser).toHaveBeenCalledTimes(1);
    }
  });

  it("la query destinatari esclude l'actor (scopedWhere + userId not)", async () => {
    await notifyWebPushForActivity(activity("DELIVERED"));
    const arg = membership.findMany.mock.calls[0][0];
    expect(arg.where.workspaceId).toBe(WS);
    expect(arg.where.userId).toEqual({ not: ACTOR });
  });

  it("l'actor non riceve nulla se è l'unico membro del workspace", async () => {
    // Simula: la query (che esclude l'actor) non restituisce nessuno.
    membership.findMany.mockResolvedValue([]);
    await notifyWebPushForActivity(activity("DELIVERED"));
    expect(sendPushToUser).not.toHaveBeenCalled();
  });

  it("senza contentId: manda comunque il testo, senza link", async () => {
    await notifyWebPushForActivity(activity("COMMENT", { contentId: null }));
    expect(content.findFirst).not.toHaveBeenCalled();
    const [, payload] = sendPushToUser.mock.calls[0];
    expect(payload.body).not.toContain("/contenuti/");
    expect(payload.url).toBeUndefined();
  });

  it("con NEXT_PUBLIC_APP_URL usa un URL assoluto", async () => {
    const prev = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com/";
    await notifyWebPushForActivity(activity("DELIVERED"));
    const [, payload] = sendPushToUser.mock.calls[0];
    expect(payload.body).toContain("https://app.example.com/contenuti/c1");
    if (prev === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = prev;
  });

  it("non lancia mai: se il lookup destinatari fallisce resta best-effort", async () => {
    membership.findMany.mockRejectedValue(new Error("db down"));
    await expect(notifyWebPushForActivity(activity("DELIVERED"))).resolves.toBeUndefined();
    expect(sendPushToUser).not.toHaveBeenCalled();
  });

  it("multi-destinatario: invia a ciascun membro", async () => {
    membership.findMany.mockResolvedValue([{ userId: "matteo" }, { userId: "sara" }]);
    await notifyWebPushForActivity(activity("DELIVERED"));
    expect(sendPushToUser).toHaveBeenCalledTimes(2);
  });
});
