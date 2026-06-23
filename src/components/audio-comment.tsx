"use client";

import { SpeakerHigh } from "@phosphor-icons/react";

/**
 * F4 (second half) — inline player for a voice-note comment. Visible to both
 * users; uses the native <audio> controls (play / scrub / duration) wrapped in
 * the app's design tokens. `src` is the Blob URL stored in `Comment.audioUrl`.
 */
export function AudioComment({ src }: { src: string }) {
  return (
    <div className="mt-1 flex items-center gap-2 rounded-xl bg-secondary/60 p-2">
      <SpeakerHigh size={16} className="shrink-0 text-muted-foreground" />
      <audio src={src} controls preload="metadata" className="h-9 w-full" />
    </div>
  );
}
