import { describe, it, expect } from "vitest";
import { resolveRawSubfolderKey } from "@/lib/drive-folders";

describe("resolveRawSubfolderKey", () => {
  it("mappa main → rawMainFolderId", () => {
    expect(resolveRawSubfolderKey("main")).toBe("rawMainFolderId");
  });
  it("mappa broll → rawBrollFolderId", () => {
    expect(resolveRawSubfolderKey("broll")).toBe("rawBrollFolderId");
  });
});
