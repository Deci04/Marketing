/** F4 — pure helpers for the video review timeline. No DOM, fully unit-testable. */

/** Format a number of seconds as `m:ss` (or `h:mm:ss` past an hour). */
export function formatTimestamp(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${ss}`;
  return `${m}:${ss}`;
}

/** Position (0..100, as a percentage) of a timestamp on a timeline of given duration. */
export function markerPercent(
  timestamp: number | null | undefined,
  duration: number | null | undefined
): number {
  if (
    timestamp == null ||
    duration == null ||
    !Number.isFinite(timestamp) ||
    !Number.isFinite(duration) ||
    duration <= 0
  ) {
    return 0;
  }
  return Math.min(100, Math.max(0, (timestamp / duration) * 100));
}

/** Whether a content item has a review proxy available for the player. */
export function hasProxy(content: { videoProxyUrl?: string | null }): boolean {
  return Boolean(content.videoProxyUrl);
}

/** Map an audio MediaRecorder mimeType (e.g. "audio/webm;codecs=opus") to a
 * sensible file extension for the uploaded Blob. Falls back to "webm". */
export function audioExtForMime(mimeType: string | null | undefined): string {
  if (!mimeType) return "webm";
  const base = mimeType.split(";")[0].trim().toLowerCase();
  switch (base) {
    case "audio/webm":
      return "webm";
    case "audio/ogg":
      return "ogg";
    case "audio/mp4":
      return "m4a";
    case "audio/mpeg":
      return "mp3";
    default:
      return "webm";
  }
}

/** Comments that are anchored to a point on the timeline (have a videoTimestamp),
 * sorted by their position. Generic comments (null timestamp) are excluded. */
export function timelineComments<T extends { videoTimestamp?: number | null }>(
  comments: T[]
): T[] {
  return comments
    .filter((c) => c.videoTimestamp != null && Number.isFinite(c.videoTimestamp))
    .sort((a, b) => (a.videoTimestamp ?? 0) - (b.videoTimestamp ?? 0));
}
