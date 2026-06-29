import { describe, it, expect } from "vitest";
import { nextNumericTitle } from "@/lib/content-title";

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
