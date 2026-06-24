/**
 * Materiali unificati — logica pura per la galleria.
 *
 * Un contenuto ha N materiali (foto o video). La modalità di visualizzazione si
 * deduce dai materiali caricati, non dal `format`. La copertina (Content.thumbnailUrl,
 * usata dalle card) è la prima foto per `order`.
 */
export type MaterialKind = "image" | "video";
export type MaterialLike = { id: string; kind: MaterialKind; url: string; order: number };

/** Forma minima accettata: `kind` è una stringa (Prisma non usa l'unione). */
type MaterialInput = { kind: string; url: string; order: number };

export function sortByOrder<T extends { order: number }>(m: readonly T[]): T[] {
  return [...m].sort((a, b) => a.order - b.order);
}

export function galleryMode(
  materials: readonly MaterialInput[]
): "empty" | "single" | "carousel" | "video" {
  if (materials.length === 0) return "empty";
  if (materials.some((m) => m.kind === "video")) return "video";
  return materials.length > 1 ? "carousel" : "single";
}

export function coverUrl(materials: readonly MaterialInput[]): string | null {
  const images = sortByOrder(materials.filter((m) => m.kind === "image"));
  return images[0]?.url ?? null;
}
