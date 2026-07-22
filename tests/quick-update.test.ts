import { describe, it, expect } from "vitest";
import { buildContentPatch } from "@/lib/content";

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const k in o) f.set(k, o[k]);
  return f;
};

describe("buildContentPatch", () => {
  it("solo title presente → {title}", () => {
    expect(buildContentPatch(fd({ title: "Ciao" }))).toEqual({ title: "Ciao" });
  });
  it("notes vuoto presente → {notes: null}", () => {
    expect(buildContentPatch(fd({ notes: "" }))).toEqual({ notes: null });
  });
  it("title + notes presenti", () => {
    expect(buildContentPatch(fd({ title: " A ", notes: " struttura " }))).toEqual({
      title: "A",
      notes: "struttura",
    });
  });
  it("nessun campo → {}", () => {
    expect(buildContentPatch(fd({ id: "x" }))).toEqual({});
  });
});
