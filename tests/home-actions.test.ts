import { describe, it, expect } from "vitest";
import {
  daysUntil,
  dayNumUTC,
  lucaBlockGroups,
  homeActions,
  type HomeContent,
} from "@/lib/workflow";

describe("daysUntil (UTC calendar days)", () => {
  it("conta 4 giorni pieni ignorando l'ora del giorno", () =>
    expect(
      daysUntil(
        new Date("2026-07-08T00:00:00.000Z"),
        new Date("2026-07-04T10:00:00.000Z")
      )
    ).toBe(4));
  it("stesso giorno UTC = 0 anche a fine giornata", () =>
    expect(
      daysUntil(
        new Date("2026-07-04T00:00:00.000Z"),
        new Date("2026-07-04T23:30:00.000Z")
      )
    ).toBe(0));
  it("scadenza passata = negativo (in ritardo)", () =>
    expect(
      daysUntil(
        new Date("2026-07-03T00:00:00.000Z"),
        new Date("2026-07-04T01:00:00.000Z")
      )
    ).toBe(-1));
  it("dayNumUTC è monotono di +1 al giorno", () =>
    expect(
      dayNumUTC(new Date("2026-07-05T00:00:00.000Z")) -
        dayNumUTC(new Date("2026-07-04T00:00:00.000Z"))
    ).toBe(1));
});

const NOW = new Date("2026-07-04T09:00:00.000Z");

function daConsegnare(
  id: string,
  format: string | null,
  blockId: string | null,
  label: string,
  deliveryYmd: string | null
): HomeContent {
  return {
    id,
    title: `c-${id}`,
    format,
    confirmedAt: null,
    hasMontato: false,
    deliveredAt: null,
    block:
      blockId && deliveryYmd
        ? { id: blockId, label, lucaDeliveryAt: new Date(`${deliveryYmd}T00:00:00.000Z`) }
        : null,
  };
}

describe("lucaBlockGroups", () => {
  it("aggrega i 'DaConsegnare' per BLOCCO (non per giorno) e nomina il formato omogeneo", () => {
    const groups = lucaBlockGroups(
      [
        daConsegnare("a", "REEL", "b1", "Blocco 1", "2026-07-08"),
        daConsegnare("b", "REEL", "b1", "Blocco 1", "2026-07-08"),
        daConsegnare("c", "REEL", "b2", "Blocco 2", "2026-07-06"),
      ],
      NOW
    );
    expect(groups).toHaveLength(2);
    // più urgente prima (2 giorni, blocco 2), poi 4 giorni (blocco 1)
    expect(groups[0]).toMatchObject({ blockId: "b2", daysUntil: 2, count: 1, noun: "Reel" });
    expect(groups[1]).toMatchObject({ blockId: "b1", daysUntil: 4, count: 2, noun: "Reel" });
    expect(groups[1].contentIds.sort()).toEqual(["a", "b"]);
  });

  it("include fino a fine settimana (≤7 giorni), esclude oltre la settimana (>7 giorni) e senza scadenza", () => {
    const groups = lucaBlockGroups(
      [
        daConsegnare("edge-in", "REEL", "be-in", "Edge in", "2026-07-11"), // +7 → INCLUSO (confine)
        daConsegnare("edge-out", "REEL", "be-out", "Edge out", "2026-07-12"), // +8 → ESCLUSO (confine)
        daConsegnare("far", "REEL", "bf", "Far", "2026-07-20"), // oltre la settimana → escluso
        daConsegnare("noblock", "REEL", null, "", null), // niente scadenza → escluso
      ],
      NOW
    );
    // Solo il confine incluso sopravvive: pinza esattamente la soglia (7).
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ blockId: "be-in", daysUntil: 7, count: 1, noun: "Reel" });
    expect(groups[0].contentIds).toEqual(["edge-in"]);
  });

  it("include le scadenze in ritardo come le più urgenti e usa 'contenuti' se i formati nel blocco sono misti", () => {
    const groups = lucaBlockGroups(
      [
        daConsegnare("late-reel", "REEL", "b-late", "Ritardo", "2026-07-03"), // in ritardo (-1)
        daConsegnare("late-caro", "CAROUSEL", "b-late", "Ritardo", "2026-07-03"),
      ],
      NOW
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ blockId: "b-late", daysUntil: -1, count: 2, noun: "contenuti" });
  });

  it("ignora i contenuti già montati (non più 'DaConsegnare')", () => {
    const montato: HomeContent = {
      ...daConsegnare("x", "REEL", "b1", "Blocco 1", "2026-07-06"),
      hasMontato: true, // ora è 'DaRevisionare'
    };
    expect(lucaBlockGroups([montato], NOW)).toHaveLength(0);
  });

  it("un contenuto consegnato (deliveredAt) esce dal gruppo del suo blocco", () => {
    const groups = lucaBlockGroups(
      [
        daConsegnare("a", "REEL", "b1", "Blocco 1", "2026-07-06"),
        { ...daConsegnare("b", "REEL", "b1", "Blocco 1", "2026-07-06"), deliveredAt: new Date() },
      ],
      NOW
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].contentIds).toEqual(["a"]);
  });
});

// Contenuto montato e non confermato → stage "DaRevisionare" (tocca a Luca).
function daRevisionareLuca(id: string): HomeContent {
  return {
    id,
    title: `m-${id}`,
    format: "REEL",
    confirmedAt: null,
    hasMontato: true,
    deliveredAt: null,
    block: null,
  };
}
// Contenuto consegnato da Luca ma non ancora montato → stage "InProduzione" (tocca a Matteo).
function inProduzione(id: string): HomeContent {
  return {
    id,
    title: `r-${id}`,
    format: "REEL",
    confirmedAt: null,
    hasMontato: false,
    deliveredAt: new Date("2026-07-01T00:00:00.000Z"),
    block: null,
  };
}

describe("homeActions", () => {
  it("Matteo vede gli 'InProduzione' (consegnati da Luca) come contenuti da montare, tono imperativo", () => {
    const actions = homeActions(
      [inProduzione("1"), inProduzione("2"), daRevisionareLuca("3")],
      "matteo",
      NOW
    );
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ emoji: "🎬", contentIds: ["1", "2"] });
    expect(actions[0].text).toBe("2 contenuti da montare");
  });

  it("Luca vede una riga PER BLOCCO (più urgente prima) poi i montati da revisionare", () => {
    const actions = homeActions(
      [
        daConsegnare("a", "REEL", "b1", "Reel settimana", "2026-07-08"),
        daConsegnare("b", "REEL", "b1", "Reel settimana", "2026-07-08"),
        daConsegnare("c", "REEL", "b1", "Reel settimana", "2026-07-08"),
        daConsegnare("d", "REEL", "b1", "Reel settimana", "2026-07-08"),
        daRevisionareLuca("m1"),
        daRevisionareLuca("m2"),
      ],
      "luca",
      NOW
    );
    expect(actions).toHaveLength(2);
    // blocco prima (urgency = giorni), revisione dopo
    expect(actions[0]).toMatchObject({ emoji: "⏳", blockId: "b1" });
    expect(actions[0].text).toBe("Blocco «Reel settimana»: 4 Reel da consegnare entro 8 lug");
    expect(actions[1]).toMatchObject({ emoji: "✅" });
    expect(actions[1].text).toBe("2 montati da revisionare");
  });

  it("tono neutro: 'entro' quando in tempo (anche oggi), 'scaduto il' quando in ritardo — mai 'Sei in ritardo'", () => {
    const soon = homeActions(
      [daConsegnare("a", "REEL", "b1", "Blocco", "2026-07-05")],
      "luca",
      NOW
    );
    expect(soon[0].text).toContain("da consegnare entro");

    const today = homeActions(
      [daConsegnare("a", "REEL", "b1", "Blocco", "2026-07-04")],
      "luca",
      NOW
    );
    expect(today[0].text).toContain("da consegnare entro");

    const late = homeActions(
      [daConsegnare("a", "REEL", "b1", "Blocco", "2026-07-02")],
      "luca",
      NOW
    );
    expect(late[0].text).toContain("(scaduto il");
    expect(late[0].text).not.toMatch(/sei in ritardo/i);
  });

  it("singolare concorda il formato quando count === 1", () => {
    const caro = homeActions(
      [daConsegnare("a", "CAROUSEL", "b1", "Blocco", "2026-07-05")],
      "luca",
      NOW
    );
    expect(caro[0].text).toContain("1 Carosello");
    const story = homeActions(
      [daConsegnare("a", "STORY", "b1", "Blocco", "2026-07-05")],
      "luca",
      NOW
    );
    expect(story[0].text).toContain("1 Storia");
    const video = homeActions(
      [daConsegnare("a", "LONG_VIDEO", "b1", "Blocco", "2026-07-04")],
      "luca",
      NOW
    );
    expect(video[0].text).toContain("1 Video");
  });

  it("niente rumore: nessuna azione quando non c'è nulla da fare", () => {
    expect(homeActions([], "luca", NOW)).toHaveLength(0);
    expect(homeActions([], "matteo", NOW)).toHaveLength(0);
  });
});
