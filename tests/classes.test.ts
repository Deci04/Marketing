import { describe, it, expect } from "vitest";
import {
  matchesFilters,
  filtersToWhere,
  classChip,
  parseClassColor,
} from "@/lib/classes";

const content = (
  format: "REEL" | "STORY" | null,
  classIds: string[]
) => ({ format, classes: classIds.map((id) => ({ id })) });

describe("matchesFilters", () => {
  it("passes everything when no filters are active", () => {
    expect(matchesFilters(content("REEL", ["a"]), {})).toBe(true);
    expect(matchesFilters(content(null, []), {})).toBe(true);
  });

  it("filters by format (OR within the axis)", () => {
    expect(matchesFilters(content("REEL", []), { formats: ["REEL"] })).toBe(true);
    expect(matchesFilters(content("STORY", []), { formats: ["REEL", "STORY"] })).toBe(
      true
    );
    expect(matchesFilters(content("REEL", []), { formats: ["STORY"] })).toBe(false);
    expect(matchesFilters(content(null, []), { formats: ["REEL"] })).toBe(false);
  });

  it("filters by class membership (OR within the axis)", () => {
    expect(matchesFilters(content("REEL", ["a", "b"]), { classIds: ["b"] })).toBe(
      true
    );
    expect(matchesFilters(content("REEL", ["a"]), { classIds: ["x"] })).toBe(false);
    expect(matchesFilters(content("REEL", []), { classIds: ["a"] })).toBe(false);
  });

  it("combines axes with AND", () => {
    expect(
      matchesFilters(content("REEL", ["a"]), { formats: ["REEL"], classIds: ["a"] })
    ).toBe(true);
    expect(
      matchesFilters(content("REEL", ["a"]), { formats: ["STORY"], classIds: ["a"] })
    ).toBe(false);
    expect(
      matchesFilters(content("REEL", ["a"]), { formats: ["REEL"], classIds: ["z"] })
    ).toBe(false);
  });
});

describe("filtersToWhere", () => {
  it("always scopes by workspace", () => {
    expect(filtersToWhere("ws_1", {})).toEqual({ workspaceId: "ws_1" });
  });

  it("adds a format `in` clause", () => {
    expect(filtersToWhere("ws_1", { formats: ["REEL", "STORY"] })).toEqual({
      workspaceId: "ws_1",
      format: { in: ["REEL", "STORY"] },
    });
  });

  it("adds a class `some` clause", () => {
    expect(filtersToWhere("ws_1", { classIds: ["a", "b"] })).toEqual({
      workspaceId: "ws_1",
      classes: { some: { id: { in: ["a", "b"] } } },
    });
  });

  it("ignores empty axes", () => {
    expect(filtersToWhere("ws_1", { formats: [], classIds: [] })).toEqual({
      workspaceId: "ws_1",
    });
  });
});

describe("classChip / parseClassColor", () => {
  it("returns a known pastel chip for valid colors", () => {
    expect(classChip("lavender")).toContain("bg-lavender");
    expect(classChip("sage")).toContain("bg-sage");
  });
  it("falls back for null / unknown colors", () => {
    expect(classChip(null)).toContain("bg-secondary");
    expect(classChip("not-a-color")).toContain("bg-secondary");
  });
  it("parseClassColor narrows valid values only", () => {
    expect(parseClassColor("coral")).toBe("coral");
    expect(parseClassColor("blue")).toBeNull();
    expect(parseClassColor(null)).toBeNull();
  });
});
