export function pct(value: number | null, digits = 1): string {
  if (value == null) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

export function pctFromPercent(value: number | null, digits = 0): string {
  if (value == null) return "—";
  return `${value.toFixed(digits)}%`;
}

export function int(value: number | null): string {
  if (value == null) return "—";
  return Math.round(value).toLocaleString("it-IT");
}

export function ratio(value: number | null, digits = 2): string {
  if (value == null) return "—";
  return `${value.toFixed(digits)}×`;
}

export function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
