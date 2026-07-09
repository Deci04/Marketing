import { describe, it, expect } from "vitest";
import { workflowState } from "@/lib/workflow";

describe("workflowState (3 stati)", () => {
  it("Da fare quando non c'è ancora il montato", () =>
    expect(workflowState({ confirmedAt: null, hasMontato: false })).toBe("Da fare"));
  it("Da revisionare quando il contenuto è caricato e non confermato", () =>
    expect(workflowState({ confirmedAt: null, hasMontato: true })).toBe("Da revisionare"));
  it("Confermato quando confirmedAt è valorizzato", () =>
    expect(workflowState({ confirmedAt: new Date(), hasMontato: true })).toBe("Confermato"));
  it("Confermato vince anche senza montato esplicito", () =>
    expect(workflowState({ confirmedAt: new Date(), hasMontato: false })).toBe("Confermato"));
});
