export type WorkflowState = "Da fare" | "Da revisionare" | "Confermato";

/** Ciclo di collaborazione basato su eventi reali:
 *  Matteo crea e carica il contenuto → Luca lo revisiona/conferma.
 *  NB: usato da content-card.tsx e content-modal.tsx — non toccare firma/comportamento. */
export function workflowState(c: {
  confirmedAt: Date | null;
  hasMontato: boolean;
}): WorkflowState {
  if (c.confirmedAt) return "Confermato";
  if (c.hasMontato) return "Da revisionare";
  return "Da fare";
}

/** Nuova macchina a stati (home "Da fare adesso"): distingue esplicitamente
 *  "Luca ha consegnato il materiale grezzo" (`deliveredAt`) da "Matteo ha
 *  caricato un montato" (`hasMontato`), cosa che `workflowState` non fa. */
export type ContentStage =
  | "DaConsegnare"
  | "InProduzione"
  | "DaRevisionare"
  | "Confermato";

export function contentStage(c: {
  deliveredAt: Date | null;
  confirmedAt: Date | null;
  hasMontato: boolean;
}): ContentStage {
  if (c.confirmedAt) return "Confermato";
  if (c.hasMontato) return "DaRevisionare";
  if (c.deliveredAt) return "InProduzione";
  return "DaConsegnare";
}

const DAY_MS = 86_400_000;

/** Indice giorno-calendario in UTC (le deadline sono date-only a mezzanotte UTC). */
export function dayNumUTC(d: Date): number {
  return Math.floor(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / DAY_MS
  );
}

/** Giorni-calendario UTC da `now` a `deadline`. 0 = oggi, 1 = domani, <0 = in ritardo. */
export function daysUntil(deadline: Date, now: Date): number {
  return dayNumUTC(deadline) - dayNumUTC(now);
}

export type HomeContent = {
  id: string;
  title: string;
  format: string | null;
  confirmedAt: Date | null;
  hasMontato: boolean;
  deliveredAt: Date | null;
  block: { id: string; label: string; lucaDeliveryAt: Date | null } | null;
};

export type BlockGroup = {
  blockId: string;
  label: string;
  count: number;
  noun: string;
  /** Formato omogeneo del gruppo (chiave), o null se misto/sconosciuto.
   *  Serve a costruire il singolare corretto quando `count === 1`. */
  format: string | null;
  daysUntil: number;
  deadline: Date;
  contentIds: string[];
};

/** Plurale imperativo del formato per il testo aggregato. */
const FORMAT_PLURAL: Record<string, string> = {
  REEL: "Reel",
  CAROUSEL: "Caroselli",
  STORY: "Storie",
  LONG_VIDEO: "Video",
};

/** Singolare imperativo del formato, per il caso `count === 1`. */
const FORMAT_SINGULAR: Record<string, string> = {
  REEL: "Reel",
  CAROUSEL: "Carosello",
  STORY: "Storia",
  LONG_VIDEO: "Video",
};

/** Finestra (giorni-calendario UTC) entro cui una scadenza è considerata
 *  "imminente" e quindi mostrata nella home. Le scadenze in ritardo (d < 0)
 *  sono sempre incluse; quelle oltre la settimana corrente sono contesto,
 *  non azione, e vengono scartate. */
const DEADLINE_WINDOW_DAYS = 7;

/** Raggruppa i contenuti ancora "DaConsegnare" per BLOCCO (`block.id`), tenendo
 *  solo i blocchi la cui scadenza (`block.lucaDeliveryAt`) è nella settimana
 *  imminente (quelle in ritardo incluse). Ordinati dal più urgente al meno
 *  urgente. Ogni blocco produce al più un gruppo, mai un gruppo per giorno:
 *  questo evita righe ripetute come "consegna i prossimi 3/2/4 Reel". */
export function lucaBlockGroups(contents: HomeContent[], now: Date): BlockGroup[] {
  const buckets = new Map<
    string,
    { label: string; lucaDeliveryAt: Date; items: HomeContent[] }
  >();
  for (const c of contents) {
    if (contentStage(c) !== "DaConsegnare") continue;
    const block = c.block;
    const dl = block?.lucaDeliveryAt;
    if (!block || !dl) continue;
    const d = daysUntil(dl, now);
    if (d > DEADLINE_WINDOW_DAYS) continue; // solo scadenze imminenti (≤ 1 settimana)
    const bucket = buckets.get(block.id);
    if (bucket) bucket.items.push(c);
    else buckets.set(block.id, { label: block.label, lucaDeliveryAt: dl, items: [c] });
  }

  return [...buckets.entries()]
    .map(([blockId, { label, lucaDeliveryAt, items }]) => {
      const formats = new Set(items.map((i) => i.format));
      const first = items[0].format ?? "";
      const homogeneous = formats.size === 1 ? first : null;
      const noun =
        homogeneous && FORMAT_PLURAL[homogeneous]
          ? FORMAT_PLURAL[homogeneous]
          : "contenuti";
      return {
        blockId,
        label,
        count: items.length,
        noun,
        format: homogeneous,
        daysUntil: daysUntil(lucaDeliveryAt, now),
        deadline: lucaDeliveryAt,
        contentIds: items.map((i) => i.id),
      };
    })
    .sort((a, b) => a.daysUntil - b.daysUntil);
}

export type HomeRole = "luca" | "matteo";

export type HomeAction = {
  key: string;
  emoji: string;
  text: string;
  urgency: number; // minore = più urgente
  contentIds: string[];
  /** Presente solo per le righe di consegna di Luca: alimenta la CTA "Ho consegnato". */
  blockId?: string;
};

const ITALIAN_SHORT_DATE = new Intl.DateTimeFormat("it-IT", {
  day: "numeric",
  month: "short",
});

/** Testo neutro (nessun "Sei in ritardo") per un blocco da consegnare. */
function blockDeadlineText(g: BlockGroup): string {
  const noun =
    g.count === 1
      ? (g.format && FORMAT_SINGULAR[g.format]) || "contenuto"
      : (g.format && FORMAT_PLURAL[g.format]) || g.noun;
  const dateStr = ITALIAN_SHORT_DATE.format(g.deadline);
  const what = `${g.count} ${noun} da consegnare`;
  return g.daysUntil < 0
    ? `Blocco «${g.label}»: ${what} (scaduto il ${dateStr})`
    : `Blocco «${g.label}»: ${what} entro ${dateStr}`;
}

/** Azioni della home ordinate per urgenza, per ruolo. Solo azioni non vuote,
 *  al più 2 (rumore zero). */
export function homeActions(
  contents: HomeContent[],
  role: HomeRole,
  now: Date
): HomeAction[] {
  if (role === "matteo") {
    // "Da montare" = Luca ha già consegnato il grezzo, Matteo non ha ancora
    // caricato un montato (InProduzione) — non "DaConsegnare", che è ancora
    // in mano a Luca.
    const toMount = contents.filter((c) => contentStage(c) === "InProduzione");
    if (!toMount.length) return [];
    return [
      {
        key: "todo",
        emoji: "🎬",
        text: `${toMount.length} ${toMount.length === 1 ? "contenuto" : "contenuti"} da montare`,
        urgency: 50,
        contentIds: toMount.map((c) => c.id),
      },
    ].slice(0, 2);
  }

  // Luca: un item per blocco (tono neutro), poi la revisione.
  const actions: HomeAction[] = lucaBlockGroups(contents, now).map((g) => ({
    key: `block-${g.blockId}`,
    emoji: "⏳",
    text: blockDeadlineText(g),
    urgency: g.daysUntil, // più vicino (o più in ritardo) = più urgente
    contentIds: g.contentIds,
    blockId: g.blockId,
  }));

  const toReview = contents.filter((c) => contentStage(c) === "DaRevisionare");
  if (toReview.length) {
    actions.push({
      key: "review",
      emoji: "✅",
      text: `${toReview.length} montat${toReview.length === 1 ? "o" : "i"} da revisionare`,
      urgency: 100, // dopo le deadline imminenti
      contentIds: toReview.map((c) => c.id),
    });
  }

  return actions.sort((a, b) => a.urgency - b.urgency).slice(0, 2);
}
