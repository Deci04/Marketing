import { describe, it, expect } from "vitest";
import { buildVisionPrompt, describePhoto } from "@/lib/diary-vision";

describe("diary-vision", () => {
  it("costruisce il prompt includendo la caption se presente", () => {
    expect(buildVisionPrompt("dietro le quinte")).toContain("dietro le quinte");
    expect(buildVisionPrompt(null)).toMatch(/foto/i);
  });

  it("degrada a null senza API key (nessun crash)", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_AUTH_TOKEN;
    delete process.env.AI_GATEWAY_API_KEY;
    const out = await describePhoto(new Uint8Array([1, 2, 3]), "x");
    expect(out).toBeNull();
  });
});
