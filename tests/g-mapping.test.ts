import { describe, it, expect } from "vitest";
import {
  encodeTitle,
  parseTitle,
  colorIdFor,
  toAllDayDate,
  fromAllDayDate,
  buildEventResource,
} from "@/lib/google-calendar";

describe("tag responsabile", () => {
  it("encode/parse round-trip con responsabile", () => {
    const t = encodeTitle("Reel palestra", "LUCA");
    expect(t).toBe("[Luca] Reel palestra");
    expect(parseTitle(t)).toEqual({ label: "Reel palestra", responsible: "LUCA" });
  });
  it("senza tag → non assegnato", () => {
    expect(parseTitle("Meeting")).toEqual({ label: "Meeting", responsible: null });
    expect(encodeTitle("Meeting", null)).toBe("Meeting");
  });
  it("colorIdFor dà un colore per persona, undefined se non assegnato", () => {
    expect(colorIdFor("LUCA")).toBeTruthy();
    expect(colorIdFor("MATTEO")).toBeTruthy();
    expect(colorIdFor("LUCA")).not.toBe(colorIdFor("MATTEO"));
    expect(colorIdFor(null)).toBeUndefined();
  });
});

describe("date all-day", () => {
  it("UTC-midnight → YYYY-MM-DD e ritorno", () => {
    const d = new Date("2026-07-04T00:00:00.000Z");
    expect(toAllDayDate(d)).toBe("2026-07-04");
    expect(fromAllDayDate("2026-07-04").toISOString()).toBe(
      "2026-07-04T00:00:00.000Z"
    );
  });
});

describe("buildEventResource", () => {
  it("all-day con end esclusivo + extendedProperties", () => {
    const ev = buildEventResource({
      label: "Uscita",
      date: new Date("2026-07-04T00:00:00.000Z"),
      responsible: "MATTEO",
      refType: "publication",
      refId: "c1",
    });
    expect(ev.summary).toBe("[Matteo] Uscita");
    expect(ev.start).toEqual({ date: "2026-07-04" });
    expect(ev.end).toEqual({ date: "2026-07-05" }); // esclusivo
    expect(ev.extendedProperties?.private).toEqual({
      responsible: "MATTEO",
      refType: "publication",
      refId: "c1",
    });
    expect(ev.colorId).toBeTruthy();
  });

  it("data non a mezzanotte-UTC → giorno corretto (no off-by-one)", () => {
    const ev = buildEventResource({
      label: "Uscita",
      date: new Date("2026-07-04T15:30:00.000Z"), // non mezzanotte-UTC
      responsible: "MATTEO",
      refType: "publication",
      refId: "c1",
    });
    expect(ev.start).toEqual({ date: "2026-07-04" });
    expect(ev.end).toEqual({ date: "2026-07-05" }); // esclusivo, nessuno slittamento
  });
});
