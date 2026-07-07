import { describe, it, expect } from "vitest";
import {
  ARCHIVE_AFTER_DAYS,
  isArchived,
  splitActiveArchived,
  matchesSearch,
} from "@/lib/content";

// Fixed "now" (UTC). 14 days before is 2026-06-20T00:00:00Z.
const now = new Date("2026-07-04T00:00:00.000Z");

type Fixture = {
  statusOverride: string | null;
  publishAt: Date | null;
  title: string;
  hook: string | null;
  notes: string | null;
  block: { lucaDeliveryAt: Date | null; matteoDeliveryAt: Date | null } | null;
};
const content = (over: Partial<Fixture> = {}): Fixture => ({
  statusOverride: null,
  publishAt: null,
  hook: null,
  notes: null,
  title: "",
  block: null,
  ...over,
});

describe("ARCHIVE_AFTER_DAYS", () => {
  it("is the 14-day threshold from the spec", () => {
    expect(ARCHIVE_AFTER_DAYS).toBe(14);
  });
});

describe("isArchived", () => {
  it("keeps a content without a publish date active", () => {
    expect(isArchived(content({ publishAt: null }), now)).toBe(false);
  });

  it("keeps a content published in the future active", () => {
    expect(
      isArchived(content({ publishAt: new Date("2026-08-01T00:00:00Z") }), now)
    ).toBe(false);
  });

  it("keeps a content published <=14 days ago active (boundary is exclusive)", () => {
    // exactly 14 days ago -> still active (spec: "da >14 giorni")
    expect(
      isArchived(content({ publishAt: new Date("2026-06-20T00:00:00.000Z") }), now)
    ).toBe(false);
    // a hair under 14 days -> active
    expect(
      isArchived(content({ publishAt: new Date("2026-06-20T00:00:01.000Z") }), now)
    ).toBe(false);
  });

  it("archives a content published more than 14 days ago", () => {
    // one second past the 14-day mark -> archived
    expect(
      isArchived(content({ publishAt: new Date("2026-06-19T23:59:59.000Z") }), now)
    ).toBe(true);
    // clearly old -> archived
    expect(
      isArchived(content({ publishAt: new Date("2026-06-01T00:00:00Z") }), now)
    ).toBe(true);
  });

  it("does not archive an old-but-not-Pubblicato content (override held back)", () => {
    expect(
      isArchived(
        content({
          publishAt: new Date("2026-06-01T00:00:00Z"),
          statusOverride: "Da consegnare",
        }),
        now
      )
    ).toBe(false);
  });

  it("does not archive a Pubblicato override with no publish date (unknown age)", () => {
    expect(
      isArchived(content({ statusOverride: "Pubblicato", publishAt: null }), now)
    ).toBe(false);
  });
});

describe("splitActiveArchived", () => {
  it("partitions preserving order and covers every item exactly once", () => {
    const items = [
      content({ title: "future", publishAt: new Date("2026-08-01T00:00:00Z") }),
      content({ title: "old", publishAt: new Date("2026-06-01T00:00:00Z") }),
      content({ title: "nodate", publishAt: null }),
      content({ title: "old2", publishAt: new Date("2026-05-01T00:00:00Z") }),
    ];
    const { active, archived } = splitActiveArchived(items, now);
    expect(active.map((c) => c.title)).toEqual(["future", "nodate"]);
    expect(archived.map((c) => c.title)).toEqual(["old", "old2"]);
    expect(active.length + archived.length).toBe(items.length);
  });
});

describe("matchesSearch", () => {
  const c = content({
    title: "Reel sul mindset",
    hook: "La verità sul focus",
    notes: "girato a Milano",
  });

  it("matches everything when the query is empty/whitespace", () => {
    expect(matchesSearch(c, "")).toBe(true);
    expect(matchesSearch(c, "   ")).toBe(true);
  });

  it("matches the title case-insensitively", () => {
    expect(matchesSearch(c, "MINDSET")).toBe(true);
  });

  it("matches the hook and the notes", () => {
    expect(matchesSearch(c, "focus")).toBe(true);
    expect(matchesSearch(c, "milano")).toBe(true);
  });

  it("returns false when nothing matches", () => {
    expect(matchesSearch(c, "youtube")).toBe(false);
  });

  it("is safe when hook/notes are null", () => {
    expect(matchesSearch(content({ title: "solo titolo" }), "titolo")).toBe(true);
    expect(matchesSearch(content({ title: "solo titolo" }), "assente")).toBe(false);
  });
});
