import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/current", () => ({ currentContext: vi.fn() }));
vi.mock("@/lib/r2", () => ({ isConfigured: vi.fn(() => true), client: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { diaryEntry: { findMany: vi.fn(async () => []) } } }));

import { currentContext } from "@/lib/current";
import { POST } from "@/app/api/diario/download/route";

const post = (body: unknown) =>
  new Request("http://localhost/api/diario/download", {
    method: "POST",
    body: JSON.stringify(body),
  });

describe("POST /api/diario/download", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401 senza sessione", async () => {
    vi.mocked(currentContext).mockResolvedValue(null as never);
    expect((await POST(post({ entryIds: ["a"] }))).status).toBe(401);
  });

  it("400 senza entryIds", async () => {
    vi.mocked(currentContext).mockResolvedValue({ workspaceId: "ws1" } as never);
    expect((await POST(post({}))).status).toBe(400);
  });

  it("404 se nessuna entry ha media", async () => {
    vi.mocked(currentContext).mockResolvedValue({ workspaceId: "ws1" } as never);
    expect((await POST(post({ entryIds: ["a"] }))).status).toBe(404);
  });
});
