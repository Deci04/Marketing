import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "vitest";
import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/workspace";
import { publish } from "@/lib/zernio";

// Zernio è SEMPRE mockato (nessuna pubblicazione reale): la rete passa da fetch.
// currentContext / del(Blob) / revalidatePath sono mockati per testare l'azione.
vi.mock("@/lib/current", () => ({
  currentContext: vi.fn(),
  currentUser: vi.fn(),
}));
vi.mock("@vercel/blob", () => ({ put: vi.fn(), del: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { currentContext } from "@/lib/current";
import { del } from "@vercel/blob";
import { publishContentAction } from "@/app/(app)/contenuti/actions";

const ws = { id: `ws_test_publish_${Date.now()}`, name: "w-publish-test" };
const ADMIN = { id: "u_admin", isAdmin: true };
const PROXY = "https://blob.example/proxy-compresso.mp4";
const MASTER = "https://drive.example/originale-piena-qualita.mp4";

function okResponse(externalId = "zx_post_1") {
  return new Response(JSON.stringify({ externalId }), { status: 200 });
}

function setCtx(user: { id: string; isAdmin: boolean }) {
  vi.mocked(currentContext).mockResolvedValue({
    user: user as never,
    role: "ADMIN" as never,
    workspace: ws as never,
    workspaceId: ws.id,
  } as never);
}

async function makeContent(over: Record<string, unknown> = {}) {
  return db.content.create({
    data: {
      workspaceId: ws.id,
      title: "post W",
      channel: "INSTAGRAM",
      confirmedAt: new Date(),
      videoProxyUrl: PROXY,
      masterLink: MASTER,
      ...over,
    },
  });
}

beforeAll(async () => {
  process.env.ZERNIO_API_KEY = "test-key";
  await db.workspace.create({ data: ws });
});

afterAll(async () => {
  await db.workspace.delete({ where: { id: ws.id } }).catch(() => {});
});

beforeEach(() => {
  vi.mocked(del).mockReset();
  vi.mocked(del).mockResolvedValue(undefined as never);
  setCtx(ADMIN);
});

afterEach(() => vi.restoreAllMocks());

describe("publish() — guardrail originale, mai il proxy", () => {
  it("invia a Zernio l'ORIGINALE e ritorna externalId", async () => {
    const c = await makeContent();
    const spy = vi.spyOn(global, "fetch").mockResolvedValue(okResponse("zx_1"));
    const res = await publish({
      workspaceId: ws.id,
      contentId: c.id,
      platforms: ["INSTAGRAM"],
      mediaUrl: MASTER,
    });
    expect(res).toEqual({ externalId: "zx_1" });
    const body = JSON.parse(String(spy.mock.calls[0][1]?.body));
    expect(body.mediaUrl).toBe(MASTER);
    expect(body.mediaUrl).not.toBe(PROXY);
  });

  it("RIFIUTA se mediaUrl coincide col proxy di review (per costruzione)", async () => {
    const c = await makeContent();
    const spy = vi.spyOn(global, "fetch").mockResolvedValue(okResponse());
    const res = await publish({
      workspaceId: ws.id,
      contentId: c.id,
      platforms: ["INSTAGRAM"],
      mediaUrl: PROXY, // il proxy!
    });
    expect("error" in res).toBe(true);
    expect(spy).not.toHaveBeenCalled(); // non ha nemmeno chiamato Zernio
  });

  it("ritorna {error} senza originale o senza piattaforme", async () => {
    const c = await makeContent();
    expect(
      "error" in (await publish({ workspaceId: ws.id, contentId: c.id, platforms: ["INSTAGRAM"], mediaUrl: "" }))
    ).toBe(true);
    expect(
      "error" in (await publish({ workspaceId: ws.id, contentId: c.id, platforms: [], mediaUrl: MASTER }))
    ).toBe(true);
  });
});

describe("publishContentAction — ciclo di vita", () => {
  it("successo con masterLink: salva externalId + published, usa l'originale non il proxy, NON cancella (nessun Blob caricato)", async () => {
    const c = await makeContent();
    const spy = vi.spyOn(global, "fetch").mockResolvedValue(okResponse("zx_ok"));
    const fd = new FormData();
    fd.set("contentId", c.id);
    fd.append("platforms", "INSTAGRAM");

    const res = await publishContentAction(fd);
    expect(res.ok).toBe(true);
    expect(res.externalId).toBe("zx_ok");

    const body = JSON.parse(String(spy.mock.calls[0][1]?.body));
    expect(body.mediaUrl).toBe(MASTER);
    expect(body.mediaUrl).not.toBe(PROXY);

    const saved = await db.content.findFirst({ where: scopedWhere(ws.id, { id: c.id }) });
    expect(saved?.externalId).toBe("zx_ok");
    expect(saved?.publishState).toBe("published");
    expect(saved?.publishError).toBeNull();
    expect(del).not.toHaveBeenCalled();
  });

  it("successo con originale caricato su Blob: cancella l'originale (resta il proxy)", async () => {
    const c = await makeContent({ masterLink: null });
    vi.spyOn(global, "fetch").mockResolvedValue(okResponse("zx_blob"));
    const uploaded = "https://blob.example/originals/orig.mp4";
    const fd = new FormData();
    fd.set("contentId", c.id);
    fd.set("originalUrl", uploaded);
    fd.append("platforms", "INSTAGRAM");

    const res = await publishContentAction(fd);
    expect(res.ok).toBe(true);
    expect(del).toHaveBeenCalledWith(uploaded);
    const saved = await db.content.findFirst({ where: scopedWhere(ws.id, { id: c.id }) });
    expect(saved?.publishState).toBe("published");
    expect(saved?.videoProxyUrl).toBe(PROXY); // il proxy resta
  });

  it("errore Zernio: publishState=failed + publishError e NON cancella l'originale (retry)", async () => {
    const c = await makeContent({ masterLink: null });
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response("boom", { status: 500 })
    );
    const uploaded = "https://blob.example/originals/orig2.mp4";
    const fd = new FormData();
    fd.set("contentId", c.id);
    fd.set("originalUrl", uploaded);
    fd.append("platforms", "INSTAGRAM");

    const res = await publishContentAction(fd);
    expect(res.ok).toBe(false);
    const saved = await db.content.findFirst({ where: scopedWhere(ws.id, { id: c.id }) });
    expect(saved?.publishState).toBe("failed");
    expect(saved?.publishError).toBeTruthy();
    expect(saved?.externalId).toBeNull();
    expect(del).not.toHaveBeenCalled(); // originale conservato per retry
  });

  it("guardrail: senza originale (né Blob né masterLink) → failed e non chiama Zernio", async () => {
    const c = await makeContent({ masterLink: null });
    const spy = vi.spyOn(global, "fetch").mockResolvedValue(okResponse());
    const fd = new FormData();
    fd.set("contentId", c.id);
    fd.append("platforms", "INSTAGRAM");

    const res = await publishContentAction(fd);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/originale/i);
    expect(spy).not.toHaveBeenCalled();
    const saved = await db.content.findFirst({ where: scopedWhere(ws.id, { id: c.id }) });
    expect(saved?.publishState).toBe("failed");
  });

  it("rifiuta un contenuto NON confermato", async () => {
    const c = await makeContent({ confirmedAt: null });
    const res = await publishContentAction(mkFd(c.id));
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/confermato/i);
  });

  it("rifiuta un utente non admin", async () => {
    setCtx({ id: "u_luca", isAdmin: false });
    const c = await makeContent();
    const res = await publishContentAction(mkFd(c.id));
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/admin/i);
  });
});

function mkFd(contentId: string) {
  const fd = new FormData();
  fd.set("contentId", contentId);
  fd.append("platforms", "INSTAGRAM");
  return fd;
}
