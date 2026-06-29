export type WorkflowState =
  | "Da consegnare"
  | "Da revisionare"
  | "Da confermare"
  | "Confermato";

/** Collaboration lifecycle based on real events (not just dates):
 *  Luca delivers material → Matteo uploads the montato → Luca confirms. */
export function workflowState(c: {
  deliveredAt: Date | null;
  confirmedAt: Date | null;
  hasMontato: boolean;
}): WorkflowState {
  if (c.confirmedAt) return "Confermato";
  if (c.hasMontato) return "Da confermare";
  if (c.deliveredAt) return "Da revisionare";
  return "Da consegnare";
}
