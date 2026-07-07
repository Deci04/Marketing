import { describe, it, expect } from "vitest";
import { readInsightDeltas, INSIGHT_KEYS } from "@/lib/kpi";

describe("readInsightDeltas", () => {
  it("calcola value + deltaAbs + deltaPct dalle righe :cur/:prev del periodo", () => {
    const rows = [
      { metric: "insight:reach:p30:cur", value: 120 },
      { metric: "insight:reach:p30:prev", value: 100 },
      { metric: "insight:reach:p7:cur", value: 50 }, // periodo diverso: ignorato
    ];
    const out = readInsightDeltas(rows, 30);
    expect(out.reach).toEqual({ value: 120, deltaAbs: 20, deltaPct: 20 });
  });

  it("deltaPct null se prev è 0 o assente; value 0 preservato", () => {
    const rows = [
      { metric: "insight:replies:p30:cur", value: 0 },
      { metric: "insight:reposts:p30:cur", value: 24 }, // nessun :prev
    ];
    const out = readInsightDeltas(rows, 30);
    expect(out.replies.value).toBe(0);
    expect(out.reposts).toEqual({ value: 24, deltaAbs: null, deltaPct: null });
  });

  it("metrica assente → value null", () => {
    const out = readInsightDeltas([], 30);
    for (const k of INSIGHT_KEYS) expect(out[k].value).toBeNull();
  });
});
