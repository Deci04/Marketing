"use client";

import { markBlockDeliveredAction } from "@/app/(app)/contenuti/actions";

/** CTA "Ho consegnato" per una riga di blocco nella home di Luca. Client
 *  Component minimo: serve solo a intercettare il click (stopPropagation)
 *  perché la riga è dentro un <summary> che altrimenti aprirebbe/chiuderebbe
 *  l'accordion insieme al submit del form. */
export function MarkBlockDeliveredButton({ blockId }: { blockId: string }) {
  return (
    <form action={markBlockDeliveredAction} onClick={(e) => e.stopPropagation()}>
      <input type="hidden" name="blockId" value={blockId} />
      <button className="shrink-0 rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-paper transition-transform active:scale-[0.98]">
        Ho consegnato
      </button>
    </form>
  );
}
