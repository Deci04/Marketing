import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/current", () => ({ currentContext: vi.fn() }));
vi.mock("@/lib/r2", () => ({
  isConfigured: vi.fn(() => true),
  buildRawKey: (ws: string, id: string, f: string) => `raw/${ws}/${id}/${f}`,
  presignPut: vi.fn(async (key: string) => `https://r2.example/${key}?sig=x`),
}));

import { currentContext } from "@/lib/current";
import { POST } from "@/app/api/diario/upload-url/route";

function post(body: unknown) {
  return new Request("http://localhost/api/diario/upload-url", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/diario/upload-url", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401 senza sessione", async () => {
    vi.mocked(currentContext).mockResolvedValue(null as never);
    const res = await POST(post({ filename: "a.png", contentType: "image/png" }));
    expect(res.status).toBe(401);
  });

  it("400 senza contentType", async () => {
    vi.mocked(currentContext).mockResolvedValue({ workspaceId: "ws1" } as never);
    const res = await POST(post({ filename: "a.png" }));
    expect(res.status).toBe(400);
  });

  it("200 con presigned url e r2Key sotto raw/{ws}/", async () => {
    vi.mocked(currentContext).mockResolvedValue({ workspaceId: "ws1" } as never);
    const res = await POST(post({ filename: "foto.png", contentType: "image/png" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.uploadUrl).toMatch(/^https:\/\/r2\.example\//);
    expect(json.r2Key).toMatch(/^raw\/ws1\/[0-9a-f-]+\/foto\.png$/);
  });
});
