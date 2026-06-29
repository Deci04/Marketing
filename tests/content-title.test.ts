import { describe, it, expect } from "vitest";
import { nextNumericTitle, nextTitleForFormat } from "@/lib/content-title";

describe("nextNumericTitle", () => {
  it("returns '1' when there are no titles", () => {
    expect(nextNumericTitle([])).toBe("1");
  });
  it("returns the next integer after a contiguous run", () => {
    expect(nextNumericTitle(["1", "2"])).toBe("3");
  });
  it("fills the smallest gap", () => {
    expect(nextNumericTitle(["1", "3"])).toBe("2");
  });
  it("ignores non-numeric titles", () => {
    expect(nextNumericTitle(["foo", "bar", "1"])).toBe("2");
  });
  it("trims whitespace around numeric titles", () => {
    expect(nextNumericTitle(["1", " 2 "])).toBe("3");
  });
});

describe("nextTitleForFormat", () => {
  it("starts at 1 for a fresh type", () => {
    expect(nextTitleForFormat([], "Reel")).toBe("Reel 1");
  });
  it("increments past existing same-type titles", () => {
    expect(nextTitleForFormat(["Reel 1", "Reel 2"], "Reel")).toBe("Reel 3");
  });
  it("counts each type independently", () => {
    expect(nextTitleForFormat(["Reel 1", "Carosello 1"], "Carosello")).toBe("Carosello 2");
  });
  it("ignores unrelated titles and is case-insensitive", () => {
    expect(nextTitleForFormat(["CTO", "reel 1"], "Reel")).toBe("Reel 2");
  });
  it("fills gaps", () => {
    expect(nextTitleForFormat(["Reel 1", "Reel 3"], "Reel")).toBe("Reel 2");
  });
});
