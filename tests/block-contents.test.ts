import { describe, it, expect } from "vitest";
import { blockContentsDiff } from "@/lib/content";

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
