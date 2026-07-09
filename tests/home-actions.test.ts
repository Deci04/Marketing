import { describe, it, expect } from "vitest";
import {
  daysUntil,
  dayNumUTC,
  lucaDeadlineGroups,
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
  deliveryYmd: string | null
): HomeContent {
  return {
    id,
    title: `c-${id}`,
    format,
    confirmedAt: null,
    hasMontato: false,
    block: deliveryYmd
      ? { lucaDeliveryAt: new Date(`${deliveryYmd}T00:00:00.000Z`) }
      : null,
  };
}

describe("lucaDeadlineGroups", () => {
  it("aggrega i 'Da consegnare' per scadenza e nomina il formato omogeneo", () => {
    const groups = lucaDeadlineGroups(
      [
        daConsegnare("a", "REEL", "2026-07-08"),
        daConsegnare("b", "REEL", "2026-07-08"),
        daConsegnare("c", "REEL", "2026-07-06"),
      ],
      NOW
    );
    expect(groups).toHaveLength(2);
    // più urgente prima (2 giorni), poi 4 giorni
    expect(groups[0]).toMatchObject({ daysUntil: 2, count: 1, noun: "Reel" });
    expect(groups[1]).toMatchObject({ daysUntil: 4, count: 2, noun: "Reel" });
    expect(groups[1].contentIds.sort()).toEqual(["a", "b"]);
  });

  it("include fino a fine settimana (≤7 giorni), esclude oltre la settimana (>7 giorni) e senza scadenza", () => {
    const groups = lucaDeadlineGroups(
      [
        daConsegnare("edge-in", "REEL", "2026-07-11"), // +7 → INCLUSO (confine)
        daConsegnare("edge-out", "REEL", "2026-07-12"), // +8 → ESCLUSO (confine)
        daConsegnare("far", "REEL", "2026-07-20"), // oltre la settimana → escluso
        daConsegnare("noblock", "REEL", null), // niente scadenza → escluso
      ],
      NOW
    );
    // Solo il confine incluso sopravvive: pinza esattamente la soglia (7).
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ daysUntil: 7, count: 1, noun: "Reel" });
    expect(groups[0].contentIds).toEqual(["edge-in"]);
  });

  it("include le scadenze in ritardo come le più urgenti e usa 'contenuti' se i formati sono misti", () => {
    const groups = lucaDeadlineGroups(
      [
        daConsegnare("late-reel", "REEL", "2026-07-03"), // in ritardo (-1)
        daConsegnare("late-caro", "CAROUSEL", "2026-07-03"),
      ],
      NOW
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ daysUntil: -1, count: 2, noun: "contenuti" });
  });

  it("ignora i contenuti già montati (non più 'Da fare')", () => {
    const montato: HomeContent = {
      ...daConsegnare("x", "REEL", "2026-07-06"),
      hasMontato: true, // ora è 'Da revisionare'
    };
    expect(lucaDeadlineGroups([montato], NOW)).toHaveLength(0);
  });
});

// Contenuto montato e non confermato → stato "Da revisionare" (tocca a Luca).
function daRevisionareLuca(id: string): HomeContent {
  return {
    id,
    title: `m-${id}`,
    format: "REEL",
    confirmedAt: null,
    hasMontato: true,
    block: null,
  };
}
// Contenuto senza montato → stato "Da fare" (tocca a Matteo).
function daFare(id: string): HomeContent {
  return {
    id,
    title: `r-${id}`,
    format: "REEL",
    confirmedAt: null,
    hasMontato: false,
    block: null,
  };
}

describe("homeActions", () => {
  it("Matteo vede i 'Da fare' come contenuti da montare, tono imperativo", () => {
    const actions = homeActions(
      [daFare("1"), daFare("2"), daRevisionareLuca("3")],
      "matteo",
      NOW
    );
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ emoji: "🎬", contentIds: ["1", "2"] });
    expect(actions[0].text).toBe("2 contenuti da montare");
  });

  it("Luca vede deadline aggregate (più urgente prima) poi i montati da revisionare", () => {
    const actions = homeActions(
      [
        daConsegnare("a", "REEL", "2026-07-08"),
        daConsegnare("b", "REEL", "2026-07-08"),
        daConsegnare("c", "REEL", "2026-07-08"),
        daConsegnare("d", "REEL", "2026-07-08"),
        daRevisionareLuca("m1"),
        daRevisionareLuca("m2"),
      ],
      "luca",
      NOW
    );
    expect(actions).toHaveLength(2);
    // deadline prima (urgency = giorni), revisione dopo
    expect(actions[0]).toMatchObject({ emoji: "⏳" });
    expect(actions[0].text).toBe("Hai 4 giorni per consegnare i prossimi 4 Reel");
    expect(actions[1]).toMatchObject({ emoji: "✅" });
    expect(actions[1].text).toBe("2 montati da revisionare");
  });

  it("frasi imperative al singolare per 1 giorno / oggi / in ritardo (mai 'i prossimi 1')", () => {
    const one = homeActions([daConsegnare("a", "REEL", "2026-07-05")], "luca", NOW);
    expect(one[0].text).toBe("Hai 1 giorno per consegnare il prossimo Reel");
    const today = homeActions([daConsegnare("a", "REEL", "2026-07-04")], "luca", NOW);
    expect(today[0].text).toBe("Consegna oggi il prossimo Reel");
    const late = homeActions([daConsegnare("a", "REEL", "2026-07-02")], "luca", NOW);
    expect(late[0].text).toBe("Sei in ritardo: consegna il prossimo Reel");
  });

  it("singolare concorda genere e formato (blocco regressione copy)", () => {
    const caro = homeActions(
      [daConsegnare("a", "CAROUSEL", "2026-07-05")],
      "luca",
      NOW
    );
    expect(caro[0].text).toBe("Hai 1 giorno per consegnare il prossimo Carosello");
    const story = homeActions([daConsegnare("a", "STORY", "2026-07-05")], "luca", NOW);
    expect(story[0].text).toBe("Hai 1 giorno per consegnare la prossima Storia");
    const videoToday = homeActions(
      [daConsegnare("a", "LONG_VIDEO", "2026-07-04")],
      "luca",
      NOW
    );
    expect(videoToday[0].text).toBe("Consegna oggi il prossimo Video");
  });

  it("niente rumore: nessuna azione quando non c'è nulla da fare", () => {
    expect(homeActions([], "luca", NOW)).toHaveLength(0);
    expect(homeActions([], "matteo", NOW)).toHaveLength(0);
  });
});
