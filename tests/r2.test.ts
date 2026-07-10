import { describe, it, expect } from "vitest";
import { buildRawKey, isConfigured, presignPut } from "@/lib/r2";

describe("buildRawKey", () => {
  it("mette il file sotto raw/{ws}/{entry}/ e sanifica il nome", () => {
    expect(buildRawKey("ws1", "e1", "Mio Video (1).mp4")).toBe(
      "raw/ws1/e1/Mio_Video__1_.mp4"
    );
  });
  it("nessuno slash nel segmento del filename (no traversal nella key)", () => {
    const k = buildRawKey("ws1", "e1", "../a/b?.png");
    expect(k.startsWith("raw/ws1/e1/")).toBe(true);
    const name = k.slice("raw/ws1/e1/".length);
    expect(name.includes("/")).toBe(false);
    expect(name).toBe(".._a_b_.png");
  });
});

describe("isConfigured", () => {
  it("false quando mancano le env R2", () => {
    const prev = { ...process.env };
    delete process.env.R2_ACCOUNT_ID;
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_SECRET_ACCESS_KEY;
    delete process.env.R2_BUCKET;
    try {
      expect(isConfigured()).toBe(false);
    } finally {
      Object.assign(process.env, prev);
    }
  });
});

describe("presignPut", () => {
  it("firma un URL PUT offline con credenziali (nessuna rete)", async () => {
    const prev = { ...process.env };
    process.env.R2_ACCOUNT_ID = "acc123";
    process.env.R2_ACCESS_KEY_ID = "AKIA_TEST";
    process.env.R2_SECRET_ACCESS_KEY = "secret_test";
    process.env.R2_BUCKET = "content-tool-diario";
    try {
      const url = await presignPut("raw/ws1/e1/foo.png", "image/png", 600);
      expect(url).toMatch(/^https:\/\/acc123\.r2\.cloudflarestorage\.com\//);
      expect(url).toMatch(/X-Amz-Signature=/);
      expect(url).toContain("raw/ws1/e1/foo.png");
    } finally {
      Object.assign(process.env, prev);
    }
  });
});
