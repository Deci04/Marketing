import { describe, it, expect } from "vitest";
import { isSafariLike } from "@/lib/video-compress";

const UA = {
  desktopSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
  desktopChrome:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  iosSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  chromeIOS:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1",
  firefox:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0",
  edge:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 Edg/120.0",
};

describe("isSafariLike", () => {
  it("desktop Safari → true (canvas-stream compression unreliable)", () =>
    expect(isSafariLike(UA.desktopSafari)).toBe(true));
  it("iOS Safari → true", () => expect(isSafariLike(UA.iosSafari)).toBe(true));
  it("Chrome on iOS (WebKit under the hood) → true", () =>
    expect(isSafariLike(UA.chromeIOS)).toBe(true));
  it("desktop Chrome → false", () =>
    expect(isSafariLike(UA.desktopChrome)).toBe(false));
  it("Firefox → false", () => expect(isSafariLike(UA.firefox)).toBe(false));
  it("Edge (Chromium) → false", () => expect(isSafariLike(UA.edge)).toBe(false));
});
