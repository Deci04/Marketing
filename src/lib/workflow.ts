export type WorkflowState = "Da fare" | "Da revisionare" | "Confermato";

/** Ciclo di collaborazione basato su eventi reali:
 *  Matteo crea e carica il contenuto → Luca lo revisiona/conferma. */
export function workflowState(c: {
  confirmedAt: Date | null;
  hasMontato: boolean;
}): WorkflowState {
  if (c.confirmedAt) return "Confermato";
  if (c.hasMontato) return "Da revisionare";
  return "Da fare";
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
  block: { lucaDeliveryAt: Date | null } | null;
};

export type DeadlineGroup = {
  daysUntil: number;
  count: number;
  noun: string;
  /** Formato omogeneo del gruppo (chiave), o null se misto/sconosciuto.
   *  Serve a costruire il singolare corretto quando `count === 1`. */
  format: string | null;
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

/** Formati di genere femminile (articolo "la prossima" invece di "il prossimo"). */
const FEMININE_FORMATS = new Set<string>(["STORY"]);

/** Finestra (giorni-calendario UTC) entro cui una scadenza è considerata
 *  "imminente" e quindi mostrata nella home. Le scadenze in ritardo (d < 0)
 *  sono sempre incluse; quelle oltre la settimana corrente sono contesto,
 *  non azione, e vengono scartate. */
const DEADLINE_WINDOW_DAYS = 7;

/** Raggruppa i contenuti ancora "Da consegnare" per la scadenza di Luca
 *  (`block.lucaDeliveryAt`), tenendo solo le scadenze della settimana
 *  imminente (quelle in ritardo incluse). Ordinati dal più urgente al meno urgente. */
export function lucaDeadlineGroups(
  contents: HomeContent[],
  now: Date
): DeadlineGroup[] {
  const buckets = new Map<number, HomeContent[]>();
  for (const c of contents) {
    if (workflowState(c) !== "Da fare") continue;
    const dl = c.block?.lucaDeliveryAt;
    if (!dl) continue;
    const d = daysUntil(dl, now);
    if (d > DEADLINE_WINDOW_DAYS) continue; // solo scadenze imminenti (≤ 1 settimana)
    const bucket = buckets.get(d);
    if (bucket) bucket.push(c);
    else buckets.set(d, [c]);
  }

  return [...buckets.entries()]
    .map(([d, items]) => {
      const formats = new Set(items.map((i) => i.format));
      const first = items[0].format ?? "";
      const homogeneous = formats.size === 1 ? first : null;
      const noun =
        homogeneous && FORMAT_PLURAL[homogeneous]
          ? FORMAT_PLURAL[homogeneous]
          : "contenuti";
      return {
        daysUntil: d,
        count: items.length,
        noun,
        format: homogeneous,
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
};

/** Testo imperativo per una deadline aggregata di Luca. */
function deadlineText(g: DeadlineGroup): string {
  // Frase al singolare naturale quando c'è un solo contenuto, con articolo
  // concordato per genere (Reel/Video/Carosello → "il prossimo"; Storia → "la prossima").
  if (g.count === 1) {
    const singular = (g.format && FORMAT_SINGULAR[g.format]) || "contenuto";
    const article =
      g.format && FEMININE_FORMATS.has(g.format) ? "la prossima" : "il prossimo";
    const what = `${article} ${singular}`;
    if (g.daysUntil < 0) return `Sei in ritardo: consegna ${what}`;
    if (g.daysUntil === 0) return `Consegna oggi ${what}`;
    if (g.daysUntil === 1) return `Hai 1 giorno per consegnare ${what}`;
    return `Hai ${g.daysUntil} giorni per consegnare ${what}`;
  }

  const what = `i prossimi ${g.count} ${g.noun}`;
  if (g.daysUntil < 0) return `Sei in ritardo: consegna ${what}`;
  if (g.daysUntil === 0) return `Consegna oggi ${what}`;
  if (g.daysUntil === 1) return `Hai 1 giorno per consegnare ${what}`;
  return `Hai ${g.daysUntil} giorni per consegnare ${what}`;
}

/** Azioni della home ordinate per urgenza, per ruolo. Solo azioni non vuote. */
export function homeActions(
  contents: HomeContent[],
  role: HomeRole,
  now: Date
): HomeAction[] {
  if (role === "matteo") {
    const toDo = contents.filter((c) => workflowState(c) === "Da fare");
    if (!toDo.length) return [];
    return [
      {
        key: "todo",
        emoji: "🎬",
        text: `${toDo.length} ${toDo.length === 1 ? "contenuto" : "contenuti"} da montare`,
        urgency: 50,
        contentIds: toDo.map((c) => c.id),
      },
    ];
  }

  // Luca
  const actions: HomeAction[] = lucaDeadlineGroups(contents, now).map((g) => ({
    key: `deadline-${g.daysUntil}`,
    emoji: "⏳",
    text: deadlineText(g),
    urgency: g.daysUntil, // più vicino = più urgente
    contentIds: g.contentIds,
  }));

  const toReview = contents.filter((c) => workflowState(c) === "Da revisionare");
  if (toReview.length) {
    actions.push({
      key: "review",
      emoji: "✅",
      text: `${toReview.length} montat${toReview.length === 1 ? "o" : "i"} da revisionare`,
      urgency: 100, // dopo le deadline imminenti
      contentIds: toReview.map((c) => c.id),
    });
  }

  return actions.sort((a, b) => a.urgency - b.urgency);
}
