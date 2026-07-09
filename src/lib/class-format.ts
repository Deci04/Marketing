// Helper colore/chip delle classi — CLIENT-SAFE: nessun import di db.
// I client component importano DA QUI (non da classes.ts, che importa db → PrismaClient
// nel bundle browser). classes.ts re-esporta questi per i consumer server.

/** Pastel palette offered when creating a class. Values map to globals.css tokens. */
export const CLASS_COLORS = ["lavender", "butter", "blush", "sage", "coral"] as const;
export type ClassColor = (typeof CLASS_COLORS)[number];

const DEFAULT_CLASS_CHIP = "bg-secondary text-muted-foreground";

const CLASS_CHIP: Record<ClassColor, string> = {
  lavender: "bg-lavender text-lavender-ink",
  butter: "bg-butter text-butter-ink",
  blush: "bg-blush text-blush-ink",
  sage: "bg-sage text-sage-ink",
  coral: "bg-coral text-coral-ink",
};

/** Chip classes for a (possibly null/unknown) class color. */
export function classChip(color: string | null | undefined): string {
  if (color && (CLASS_COLORS as readonly string[]).includes(color)) {
    return CLASS_CHIP[color as ClassColor];
  }
  return DEFAULT_CLASS_CHIP;
}

export function parseClassColor(value: string | null | undefined): ClassColor | null {
  if (value && (CLASS_COLORS as readonly string[]).includes(value)) {
    return value as ClassColor;
  }
  return null;
}
