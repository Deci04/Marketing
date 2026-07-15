import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/current", () => ({ currentContext: vi.fn() }));
vi.mock("@/lib/r2", () => ({
  isConfigured: vi.fn(() => true),
  presignGet: vi.fn(async (key: string) => `https://r2.example/${key}?sig=x`),
}));
vi.mock("@/lib/db", () => ({
  db: { diaryEntry: { findFirst: vi.fn(async () => null) } },
}));

import { currentContext } from "@/lib/current";
import { GET } from "@/app/api/diario/media/[...key]/route";

const req = () =>
  new Request("http://localhost/api/diario/media/raw/ws1/e/foto.png");
const params = (parts: string[]) => ({ params: Promise.resolve({ key: parts }) });

describe("GET /api/diario/media/[...key]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401 senza sessione", async () => {
    vi.mocked(currentContext).mockResolvedValue(null as never);
    const res = await GET(req(), params(["raw", "ws1", "e", "foto.png"]));
    expect(res.status).toBe(401);
  });

  it("403 se la key non appartiene al workspace", async () => {
    vi.mocked(currentContext).mockResolvedValue({ workspaceId: "ws1" } as never);
    const res = await GET(req(), params(["raw", "ws2", "e", "foto.png"]));
    expect(res.status).toBe(403);
  });

  it("redirige al presigned GET per la propria key", async () => {
    vi.mocked(currentContext).mockResolvedValue({ workspaceId: "ws1" } as never);
    const res = await GET(req(), params(["raw", "ws1", "e", "foto.png"]));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toMatch(/^https:\/\/r2\.example\//);
  });
});
