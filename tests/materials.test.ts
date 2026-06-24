import { describe, it, expect } from "vitest";
import { galleryMode, coverUrl, sortByOrder } from "@/lib/materials";

const img = (id: string, order: number) => ({ id, kind: "image" as const, url: `i/${id}`, order });
const vid = (id: string, order: number) => ({ id, kind: "video" as const, url: `v/${id}`, order });

describe("galleryMode", () => {
  it("empty when no materials", () => expect(galleryMode([])).toBe("empty"));
  it("single for one image", () => expect(galleryMode([img("a", 0)])).toBe("single"));
  it("carousel for >1 image", () => expect(galleryMode([img("a", 0), img("b", 1)])).toBe("carousel"));
  it("video when any video present", () => expect(galleryMode([vid("a", 0)])).toBe("video"));
  it("video wins over images", () => expect(galleryMode([img("a", 0), vid("b", 1)])).toBe("video"));
});

describe("coverUrl", () => {
  it("first image by order", () => expect(coverUrl([img("b", 1), img("a", 0)])).toBe("i/a"));
  it("null when only video", () => expect(coverUrl([vid("a", 0)])).toBe(null));
  it("null when empty", () => expect(coverUrl([])).toBe(null));
});

describe("sortByOrder", () => {
  it("orders ascending by order", () =>
    expect(sortByOrder([img("b", 2), img("a", 1)]).map((m) => m.id)).toEqual(["a", "b"]));
});
