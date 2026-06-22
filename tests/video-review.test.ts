import { describe, it, expect } from "vitest";
import {
  formatTimestamp,
  markerPercent,
  hasProxy,
  timelineComments,
} from "@/lib/video-review";

describe("formatTimestamp", () => {
  it("formats seconds as m:ss", () => {
    expect(formatTimestamp(0)).toBe("0:00");
    expect(formatTimestamp(5)).toBe("0:05");
    expect(formatTimestamp(65)).toBe("1:05");
    expect(formatTimestamp(125)).toBe("2:05");
  });

  it("formats past an hour as h:mm:ss", () => {
    expect(formatTimestamp(3661)).toBe("1:01:01");
  });

  it("floors fractional seconds", () => {
    expect(formatTimestamp(9.9)).toBe("0:09");
  });

  it("handles null/invalid input", () => {
    expect(formatTimestamp(null)).toBe("0:00");
    expect(formatTimestamp(undefined)).toBe("0:00");
    expect(formatTimestamp(-3)).toBe("0:00");
    expect(formatTimestamp(NaN)).toBe("0:00");
  });
});

describe("markerPercent", () => {
  it("computes position as a percentage of duration", () => {
    expect(markerPercent(0, 100)).toBe(0);
    expect(markerPercent(50, 100)).toBe(50);
    expect(markerPercent(100, 100)).toBe(100);
  });

  it("clamps to 0..100", () => {
    expect(markerPercent(150, 100)).toBe(100);
    expect(markerPercent(-10, 100)).toBe(0);
  });

  it("returns 0 for invalid duration", () => {
    expect(markerPercent(30, 0)).toBe(0);
    expect(markerPercent(30, null)).toBe(0);
    expect(markerPercent(null, 100)).toBe(0);
  });
});

describe("hasProxy", () => {
  it("is true only when a proxy url is present", () => {
    expect(hasProxy({ videoProxyUrl: "https://x/y.webm" })).toBe(true);
    expect(hasProxy({ videoProxyUrl: null })).toBe(false);
    expect(hasProxy({})).toBe(false);
  });
});

describe("timelineComments", () => {
  it("keeps only anchored comments, sorted by timestamp", () => {
    const input = [
      { id: "a", videoTimestamp: 30 },
      { id: "b", videoTimestamp: null },
      { id: "c", videoTimestamp: 5 },
      { id: "d", videoTimestamp: 12 },
    ];
    expect(timelineComments(input).map((c) => c.id)).toEqual(["c", "d", "a"]);
  });

  it("excludes NaN timestamps", () => {
    const input = [
      { id: "a", videoTimestamp: NaN },
      { id: "b", videoTimestamp: 1 },
    ];
    expect(timelineComments(input).map((c) => c.id)).toEqual(["b"]);
  });
});
