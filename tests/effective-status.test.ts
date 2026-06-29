import { describe, it, expect } from "vitest";
import { effectiveStatus } from "@/lib/status";

const past = new Date("2026-06-01T00:00:00Z");
const now = new Date("2026-06-29T00:00:00Z");

describe("effectiveStatus", () => {
  it("uses the date-derived status when there is no override", () => {
    expect(effectiveStatus(null, { publishAt: past }, now)).toBe("Pubblicato");
    expect(effectiveStatus(null, {}, now)).toBe("Da consegnare");
  });
  it("a valid manual override wins over the derived status", () => {
    // publishAt in the past would derive "Pubblicato", but the user forced it back.
    expect(effectiveStatus("Revisionato", { publishAt: past }, now)).toBe("Revisionato");
  });
  it("an empty/invalid override falls back to auto", () => {
    expect(effectiveStatus("", { publishAt: past }, now)).toBe("Pubblicato");
    expect(effectiveStatus("Boh", { publishAt: past }, now)).toBe("Pubblicato");
  });
});
