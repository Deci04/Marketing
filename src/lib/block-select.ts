// Pure, client-safe helpers for the block-edit dialog's content checklist.
// Kept free of any server-only imports (DB, google-calendar, node-fetch) so it
// can be imported from the client `calendar-board.tsx` without dragging
// server modules into the browser bundle.

/** Candidati mostrabili nella checklist "Contenuti nel periodo" del dialog di
 *  un blocco: contenuti con `publishAt` nel range del blocco che sono liberi
 *  (blockId null) o già di QUESTO blocco. Esclude i contenuti già assegnati
 *  a un ALTRO blocco — altrimenti salvare li ruberebbe (vedi setBlockContents). */
export function blockCandidateContents(
  contents: { id: string; title: string; publishAt: string | null; blockId: string | null }[],
  block: { id: string; start: string; end: string }
): { id: string; title: string; alreadyInBlock: boolean }[] {
  return contents
    .filter(
      (c) =>
        c.publishAt != null &&
        c.publishAt >= block.start &&
        c.publishAt <= block.end &&
        (c.blockId == null || c.blockId === block.id)
    )
    .map((c) => ({ id: c.id, title: c.title, alreadyInBlock: c.blockId === block.id }));
}
