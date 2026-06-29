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
