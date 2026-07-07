import { describe, it, expect } from "vitest";
import { deltaFmt } from "@/components/kpi/kpi-format";

describe("deltaFmt", () => {
  it("positivo → up con +", () => expect(deltaFmt(12.3)).toEqual({ text: "+12%", tone: "up" }));
  it("negativo → down", () => expect(deltaFmt(-4.6)).toEqual({ text: "−5%", tone: "down" }));
  it("null → flat trattino", () => expect(deltaFmt(null)).toEqual({ text: "—", tone: "flat" }));
  it("zero → flat", () => expect(deltaFmt(0)).toEqual({ text: "0%", tone: "flat" }));
});
