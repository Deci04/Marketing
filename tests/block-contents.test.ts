import { describe, it, expect } from "vitest";
import { blockContentsDiff, blockCandidateContents } from "@/lib/content";

describe("blockContentsDiff", () => {
  it("attacca i nuovi, stacca i rimossi", () => {
    expect(blockContentsDiff(["a", "b"], ["b", "c"])).toEqual({ toAttach: ["c"], toDetach: ["a"] });
  });
  it("nessuna modifica", () => {
    expect(blockContentsDiff(["a"], ["a"])).toEqual({ toAttach: [], toDetach: [] });
  });
  it("da vuoto", () => {
    expect(blockContentsDiff([], ["x", "y"])).toEqual({ toAttach: ["x", "y"], toDetach: [] });
  });
});

describe("blockCandidateContents", () => {
  it("esclude contenuti di un altro blocco, include liberi e propri", () => {
    const c = [
      { id: "a", title: "A", publishAt: "2026-07-07", blockId: null }, // libero nel periodo → incluso
      { id: "b", title: "B", publishAt: "2026-07-08", blockId: "BLK" }, // già di questo blocco → incluso
      { id: "c", title: "C", publishAt: "2026-07-09", blockId: "OTHER" }, // di altro blocco → escluso
      { id: "d", title: "D", publishAt: "2026-08-01", blockId: null }, // fuori periodo → escluso
    ];
    const out = blockCandidateContents(c, { id: "BLK", start: "2026-07-06", end: "2026-07-12" });
    expect(out.map((x) => x.id)).toEqual(["a", "b"]);
    expect(out.find((x) => x.id === "b")!.alreadyInBlock).toBe(true);
  });
});
