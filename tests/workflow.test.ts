import { describe, it, expect } from "vitest";
import {
  workflowState,
  contentStage,
  daysUntil,
  dayNumUTC,
  homeActions,
  type HomeContent,
} from "@/lib/workflow";

describe("workflowState (3 stati, invariato — usato da content-card/content-modal)", () => {
  it("Da fare quando non c'è ancora il montato", () =>
    expect(workflowState({ confirmedAt: null, hasMontato: false })).toBe("Da fare"));
  it("Da revisionare quando il contenuto è caricato e non confermato", () =>
    expect(workflowState({ confirmedAt: null, hasMontato: true })).toBe("Da revisionare"));
  it("Confermato quando confirmedAt è valorizzato", () =>
    expect(workflowState({ confirmedAt: new Date(), hasMontato: true })).toBe("Confermato"));
  it("Confermato vince anche senza montato esplicito", () =>
    expect(workflowState({ confirmedAt: new Date(), hasMontato: false })).toBe("Confermato"));
});

describe("dayNumUTC / daysUntil", () => {
  it("dayNumUTC azzera l'orario, resta il giorno-calendario UTC", () => {
    const a = new Date("2026-07-15T23:59:00Z");
    const b = new Date("2026-07-15T00:00:00Z");
    expect(dayNumUTC(a)).toBe(dayNumUTC(b));
  });
  it("daysUntil: 0 oggi, positivo nel futuro, negativo in ritardo", () => {
    const now = new Date("2026-07-15T10:00:00Z");
    expect(daysUntil(new Date("2026-07-15T00:00:00Z"), now)).toBe(0);
    expect(daysUntil(new Date("2026-07-17T00:00:00Z"), now)).toBe(2);
    expect(daysUntil(new Date("2026-07-13T00:00:00Z"), now)).toBe(-2);
  });
});

describe("contentStage (nuova macchina a stati, con deliveredAt)", () => {
  it("DaConsegnare quando nulla è ancora successo", () =>
    expect(
      contentStage({ deliveredAt: null, confirmedAt: null, hasMontato: false })
    ).toBe("DaConsegnare"));
  it("InProduzione quando Luca ha consegnato ma non c'è ancora montato", () =>
    expect(
      contentStage({ deliveredAt: new Date(), confirmedAt: null, hasMontato: false })
    ).toBe("InProduzione"));
  it("DaRevisionare quando c'è un montato, consegnato o no", () =>
    expect(
      contentStage({ deliveredAt: new Date(), confirmedAt: null, hasMontato: true })
    ).toBe("DaRevisionare"));
  it("DaRevisionare vince anche senza deliveredAt esplicito", () =>
    expect(
      contentStage({ deliveredAt: null, confirmedAt: null, hasMontato: true })
    ).toBe("DaRevisionare"));
  it("Confermato vince su tutto", () =>
    expect(
      contentStage({ deliveredAt: new Date(), confirmedAt: new Date(), hasMontato: true })
    ).toBe("Confermato"));
});

describe("homeActions — Luca: raggruppa per blocco, non per giorno", () => {
  const now = new Date("2026-07-15T09:00:00Z");

  function content(
    id: string,
    blockId: string,
    label: string,
    lucaDeliveryAt: Date | null,
    overrides: Partial<HomeContent> = {}
  ): HomeContent {
    return {
      id,
      title: id,
      format: "REEL",
      confirmedAt: null,
      hasMontato: false,
      deliveredAt: null,
      block: blockId ? { id: blockId, label, lucaDeliveryAt } : null,
      ...overrides,
    };
  }

  it("due blocchi in ritardo producono DUE item distinti (non righe identiche)", () => {
    const late1 = new Date("2026-07-13T00:00:00Z"); // -2gg
    const late2 = new Date("2026-07-10T00:00:00Z"); // -5gg
    const contents: HomeContent[] = [
      content("c1", "b1", "Blocco A", late1),
      content("c2", "b1", "Blocco A", late1),
      content("c3", "b1", "Blocco A", late1),
      content("c4", "b2", "Blocco B", late2),
      content("c5", "b2", "Blocco B", late2),
    ];
    const actions = homeActions(contents, "luca", now);
    const blockActions = actions.filter((a) => a.blockId);
    expect(blockActions).toHaveLength(2);
    const keys = blockActions.map((a) => a.key);
    expect(new Set(keys).size).toBe(2);
    // Le due righe non sono testualmente identiche.
    expect(blockActions[0].text).not.toBe(blockActions[1].text);
  });

  it("il tono è neutro: mai 'Sei in ritardo'", () => {
    const late = new Date("2026-07-10T00:00:00Z");
    const contents: HomeContent[] = [content("c1", "b1", "Blocco A", late)];
    const actions = homeActions(contents, "luca", now);
    expect(actions.some((a) => /sei in ritardo/i.test(a.text))).toBe(false);
  });

  it("blocco puntuale: testo con nome del blocco e scadenza (on time / scaduto)", () => {
    const soon = new Date("2026-07-17T00:00:00Z"); // +2gg
    const contents: HomeContent[] = [
      content("c1", "b1", "Reel settimana", soon),
      content("c2", "b1", "Reel settimana", soon),
    ];
    const actions = homeActions(contents, "luca", now);
    const a = actions.find((x) => x.blockId === "b1")!;
    expect(a.text).toContain("Blocco «Reel settimana»");
    expect(a.text).toContain("2 Reel");
    expect(a.text).toContain("da consegnare entro");

    const late = new Date("2026-07-10T00:00:00Z");
    const lateActions = homeActions(
      [content("c3", "b2", "Storie vecchie", late)],
      "luca",
      now
    );
    const b = lateActions.find((x) => x.blockId === "b2")!;
    expect(b.text).toContain("scaduto il");
  });

  it("un contenuto consegnato (deliveredAt) sparisce dal 'da consegnare' del blocco", () => {
    const late = new Date("2026-07-10T00:00:00Z");
    const contents: HomeContent[] = [
      content("c1", "b1", "Blocco A", late),
      content("c2", "b1", "Blocco A", late, { deliveredAt: new Date() }),
    ];
    const actions = homeActions(contents, "luca", now);
    const a = actions.find((x) => x.blockId === "b1")!;
    expect(a.contentIds).toEqual(["c1"]);
    expect(a.text).toContain("1 Reel");
  });

  it("cap a 2 item anche con molti blocchi + revisione", () => {
    const contents: HomeContent[] = [
      content("c1", "b1", "A", new Date("2026-07-13T00:00:00Z")),
      content("c2", "b2", "B", new Date("2026-07-14T00:00:00Z")),
      content("c3", "b3", "C", new Date("2026-07-16T00:00:00Z")),
      content("c4", "b4", "D", null, { hasMontato: true }),
    ];
    const actions = homeActions(contents, "luca", now);
    expect(actions.length).toBeLessThanOrEqual(2);
  });

  it("la revisione resta invariata: '{N} montati da revisionare'", () => {
    const contents: HomeContent[] = [
      content("c1", "b1", "A", null, { hasMontato: true }),
      content("c2", "b1", "A", null, { hasMontato: true }),
    ];
    const actions = homeActions(contents, "luca", now);
    expect(actions.some((a) => a.text === "2 montati da revisionare")).toBe(true);
  });
});

describe("homeActions — Matteo: 'da montare' conta InProduzione, non DaConsegnare", () => {
  const now = new Date("2026-07-15T09:00:00Z");

  it("un contenuto solo consegnato (InProduzione) conta; uno non consegnato no", () => {
    const contents: HomeContent[] = [
      {
        id: "delivered",
        title: "delivered",
        format: "REEL",
        confirmedAt: null,
        hasMontato: false,
        deliveredAt: new Date(),
        block: null,
      },
      {
        id: "not-delivered",
        title: "not-delivered",
        format: "REEL",
        confirmedAt: null,
        hasMontato: false,
        deliveredAt: null,
        block: null,
      },
    ];
    const actions = homeActions(contents, "matteo", now);
    expect(actions).toHaveLength(1);
    expect(actions[0].text).toBe("1 contenuto da montare");
    expect(actions[0].contentIds).toEqual(["delivered"]);
  });

  it("nessuna azione quando non c'è nulla InProduzione", () => {
    const contents: HomeContent[] = [
      {
        id: "c1",
        title: "c1",
        format: null,
        confirmedAt: null,
        hasMontato: false,
        deliveredAt: null,
        block: null,
      },
    ];
    expect(homeActions(contents, "matteo", now)).toEqual([]);
  });
});
