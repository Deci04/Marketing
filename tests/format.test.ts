import { describe, it, expect } from "vitest";
import {
  FORMAT_LABELS,
  FORMAT_ORDER,
  formatLabel,
  parseFormat,
} from "@/lib/format";

describe("format labels", () => {
  it("maps every format to an Italian label", () => {
    expect(FORMAT_LABELS.STORY).toBe("Storie");
    expect(FORMAT_LABELS.CAROUSEL).toBe("Carosello");
    expect(FORMAT_LABELS.REEL).toBe("Reel");
    expect(FORMAT_LABELS.LONG_VIDEO).toBe("Video lungo");
  });

  it("has a label for every format in the display order", () => {
    for (const f of FORMAT_ORDER) {
      expect(FORMAT_LABELS[f]).toBeTruthy();
    }
  });
});

describe("formatLabel", () => {
  it("returns the label for a valid format", () => {
    expect(formatLabel("REEL")).toBe("Reel");
  });
  it("returns null for null/undefined", () => {
    expect(formatLabel(null)).toBeNull();
    expect(formatLabel(undefined)).toBeNull();
  });
});

describe("parseFormat", () => {
  it("accepts valid enum values", () => {
    expect(parseFormat("STORY")).toBe("STORY");
    expect(parseFormat("LONG_VIDEO")).toBe("LONG_VIDEO");
  });
  it("rejects invalid / empty values", () => {
    expect(parseFormat("")).toBeNull();
    expect(parseFormat("BOGUS")).toBeNull();
    expect(parseFormat(null)).toBeNull();
    expect(parseFormat(undefined)).toBeNull();
  });
});
