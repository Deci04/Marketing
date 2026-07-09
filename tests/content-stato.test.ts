import { describe, it, expect } from "vitest";
import { parseStato, contentsForStato } from "@/lib/content";

const now = new Date("2026-07-09T00:00:00.000Z");
// Pubblicato da >14 giorni → archiviato.
const archived = { id: "a", publishAt: new Date("2026-06-01T00:00:00.000Z"), block: null, statusOverride: null };
// Pubblicazione futura → attivo.
const active = { id: "b", publishAt: new Date("2026-07-20T00:00:00.000Z"), block: null, statusOverride: null };

describe("parseStato", () => {
  it("default lavorazione", () => expect(parseStato(undefined)).toBe("lavorazione"));
  it("valore valido passa", () => expect(parseStato("pubblicati")).toBe("pubblicati"));
  it("valore ignoto → lavorazione", () => expect(parseStato("xxx")).toBe("lavorazione"));
  it("array → primo elemento", () => expect(parseStato(["tutti"])).toBe("tutti"));
});

describe("contentsForStato", () => {
  const all = [archived, active];
  it("lavorazione = solo attivi", () =>
    expect(contentsForStato(all, "lavorazione", now).map((c) => c.id)).toEqual(["b"]));
  it("pubblicati = solo archiviati", () =>
    expect(contentsForStato(all, "pubblicati", now).map((c) => c.id)).toEqual(["a"]));
  it("tutti = tutto", () =>
    expect(contentsForStato(all, "tutti", now).map((c) => c.id).sort()).toEqual(["a", "b"]));
});
