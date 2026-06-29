export type StatusInput = {
  publishAt?: Date | null;
  lucaDeliveryAt?: Date | null;
  matteoDeliveryAt?: Date | null;
};

export type DerivedStatus =
  | "Da consegnare"
  | "Consegnato"
  | "Revisionato"
  | "Pubblicato";

/** Derive a content's status from dates that have passed.
 * Publication wins over Matteo's delivery, which wins over Luca's. */
export function deriveStatus(
  input: StatusInput,
  now: Date = new Date()
): DerivedStatus {
  const passed = (d?: Date | null) => d != null && d.getTime() <= now.getTime();
  if (passed(input.publishAt)) return "Pubblicato";
  if (passed(input.matteoDeliveryAt)) return "Revisionato";
  if (passed(input.lucaDeliveryAt)) return "Consegnato";
  return "Da consegnare";
}

export const STATUS_VALUES: DerivedStatus[] = [
  "Da consegnare",
  "Consegnato",
  "Revisionato",
  "Pubblicato",
];

export function isDerivedStatus(s: string): s is DerivedStatus {
  return (STATUS_VALUES as string[]).includes(s);
}

/** The status to show: a valid manual override if set, otherwise the auto-derived one. */
export function effectiveStatus(
  override: string | null | undefined,
  input: StatusInput,
  now?: Date
): DerivedStatus {
  if (override && isDerivedStatus(override)) return override;
  return deriveStatus(input, now);
}
