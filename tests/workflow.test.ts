import { describe, it, expect } from "vitest";
import { workflowState } from "@/lib/workflow";

describe("workflowState", () => {
  it("Da consegnare when nothing happened", () =>
    expect(workflowState({ deliveredAt: null, confirmedAt: null, hasMontato: false })).toBe(
      "Da consegnare"
    ));
  it("Da revisionare when delivered but no montato", () =>
    expect(
      workflowState({ deliveredAt: new Date(), confirmedAt: null, hasMontato: false })
    ).toBe("Da revisionare"));
  it("Da confermare when montato present and not confirmed", () =>
    expect(
      workflowState({ deliveredAt: new Date(), confirmedAt: null, hasMontato: true })
    ).toBe("Da confermare"));
  it("Confermato when confirmedAt set", () =>
    expect(
      workflowState({ deliveredAt: new Date(), confirmedAt: new Date(), hasMontato: true })
    ).toBe("Confermato"));
  it("montato without explicit delivery still Da confermare", () =>
    expect(workflowState({ deliveredAt: null, confirmedAt: null, hasMontato: true })).toBe(
      "Da confermare"
    ));
});
