/** Smallest positive integer (as string) not already used as an exact title. */
export function nextNumericTitle(existingTitles: string[]): string {
  const used = new Set<number>();
  for (const t of existingTitles) {
    const trimmed = t.trim();
    if (/^\d+$/.test(trimmed)) used.add(Number(trimmed));
  }
  let n = 1;
  while (used.has(n)) n++;
  return String(n);
}

/** Auto-name a content by its type: "Reel 1", "Reel 2", ... — the smallest
 *  positive integer not already used in a "<label> <n>" title (case-insensitive). */
export function nextTitleForFormat(existingTitles: string[], label: string): string {
  const re = new RegExp(`^${label}\\s+(\\d+)$`, "i");
  const used = new Set<number>();
  for (const t of existingTitles) {
    const m = t.trim().match(re);
    if (m) used.add(Number(m[1]));
  }
  let n = 1;
  while (used.has(n)) n++;
  return `${label} ${n}`;
}
