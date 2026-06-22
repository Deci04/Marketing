import type { ContentFormat } from "@prisma/client";

/** Italian labels for the content format (tipologia). */
export const FORMAT_LABELS: Record<ContentFormat, string> = {
  STORY: "Storie",
  CAROUSEL: "Carosello",
  REEL: "Reel",
  LONG_VIDEO: "Video lungo",
};

/** Stable display order for the format selector / filters. */
export const FORMAT_ORDER: ContentFormat[] = [
  "STORY",
  "CAROUSEL",
  "REEL",
  "LONG_VIDEO",
];

/** Pastel chip styles per format (uses globals.css tokens). */
export const FORMAT_CHIP: Record<ContentFormat, string> = {
  STORY: "bg-blush text-blush-ink",
  CAROUSEL: "bg-lavender text-lavender-ink",
  REEL: "bg-coral text-coral-ink",
  LONG_VIDEO: "bg-sage text-sage-ink",
};

/** Human label for a (possibly null) format value. */
export function formatLabel(format: ContentFormat | null | undefined): string | null {
  return format ? FORMAT_LABELS[format] : null;
}

/** Narrow an arbitrary string to a valid ContentFormat (or null). */
export function parseFormat(value: string | null | undefined): ContentFormat | null {
  if (!value) return null;
  return (FORMAT_ORDER as string[]).includes(value)
    ? (value as ContentFormat)
    : null;
}
