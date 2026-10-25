// Dates are handled as UTC calendar days in YYYY-MM-DD form.

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toIsoDate(d);
}

export function today(): string {
  return toIsoDate(new Date());
}

export function yesterday(): string {
  return addDays(today(), -1);
}

export function daysBetween(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000);
}

export function eachDay(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** The last N full days, ending yesterday. */
export function lastNDays(n: number): { start: string; end: string } {
  const end = yesterday();
  return { start: addDays(end, -(n - 1)), end };
}
