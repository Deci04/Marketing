import { describe, it, expect } from "vitest";
import {
  buildOrganizePrompt,
  organizeDiary,
  type OrganizeEntry,
  type OrganizeResult,
} from "@/lib/diary-organize";

const entries: OrganizeEntry[] = [
  { id: "a", mediaType: "video", rawText: "girato in barca", caption: null, aiTitle: null, aiDescription: null },
  { id: "b", mediaType: "image", rawText: null, caption: "tramonto", aiTitle: null, aiDescription: "spiaggia al tramonto" },
];

describe("buildOrganizePrompt", () => {
  it("elenca gli id con testi e descrizioni", () => {
    const p = buildOrganizePrompt(entries);
    expect(p).toContain("[id:a]");
    expect(p).toContain("girato in barca");
    expect(p).toContain("[id:b]");
    expect(p).toContain("spiaggia al tramonto");
    expect(p).toMatch(/principal/i);
    expect(p).toMatch(/contesto|b-roll/i);
  });
});

describe("organizeDiary", () => {
  it("vuoto → nessuna scheda e NON chiama l'AI", async () => {
    let called = false;
    const res = await organizeDiary([], async () => {
      called = true;
      return { schede: [] };
    });
    expect(res.schede).toEqual([]);
    expect(called).toBe(false);
  });

  it("scarta i media con entryId inesistenti (anti-allucinazione)", async () => {
    const fake = async (): Promise<OrganizeResult> => ({
      schede: [
        {
          titolo: "Giro in barca",
          contesto: "in barca",
          intento: "vlog",
          cosaDice: "…",
          messaggio: "libertà",
          media: [
            { entryId: "a", ruolo: "principale" },
            { entryId: "ZZZ", ruolo: "contesto" },
          ],
        },
      ],
    });
    const res = await organizeDiary(entries, fake);
    expect(res.schede[0].media.map((m) => m.entryId)).toEqual(["a"]);
  });
});
