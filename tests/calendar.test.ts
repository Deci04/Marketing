import { describe, it, expect } from "vitest";
import { monthMatrix } from "@/lib/calendar";

describe("monthMatrix", () => {
  it("returns 6 weeks of 7 days", () => {
    const m = monthMatrix(2026, 5); // June 2026
    expect(m).toHaveLength(6);
    for (const w of m) expect(w).toHaveLength(7);
  });

  it("starts each week on Monday", () => {
    for (const w of monthMatrix(2026, 5)) {
      expect(w[0].getUTCDay()).toBe(1); // 1 = Monday
    }
  });

  it("includes the first day of the month", () => {
    const flat = monthMatrix(2026, 5).flat();
    const hasFirst = flat.some(
      (d) =>
        d.getUTCFullYear() === 2026 &&
        d.getUTCMonth() === 5 &&
        d.getUTCDate() === 1
    );
    expect(hasFirst).toBe(true);
  });

  it("is contiguous (each cell is the next day)", () => {
    const flat = monthMatrix(2026, 5).flat();
    for (let i = 1; i < flat.length; i++) {
      expect(flat[i].getTime() - flat[i - 1].getTime()).toBe(86_400_000);
    }
  });
});
