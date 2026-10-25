// Tiny template language for the recorded demo answers. See fixtures/console/recorded-answers.json.
import { lastNDays } from "@/lib/dates";

function get(root: unknown, path: string): unknown {
  let cur: unknown = root;
  for (const part of path.split(".")) {
    if (cur == null) return undefined;
    if (Array.isArray(cur)) {
      if (part === "length") cur = cur.length;
      else {
        const i = Number(part);
        cur = cur[i < 0 ? cur.length + i : i];
      }
    } else {
      cur = (cur as Record<string, unknown>)[part];
    }
  }
  return cur;
}

function dates(): Record<string, { start: string; end: string }> {
  return { last7: lastNDays(7), last30: lastNDays(30), last90: lastNDays(90) };
}

const FILTERS: Record<string, (v: number) => string> = {
  money: (v) => v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  int: (v) => Math.round(v).toLocaleString("en-US"),
  pct: (v) => `${v.toFixed(1)}%`,
  x: (v) => (v >= 10 ? Math.round(v).toString() : v.toFixed(1)),
};

export function render(template: string, results: unknown[] = []): string {
  const root = { ...dates(), ...Object.fromEntries(results.map((r, i) => [String(i), r])) };
  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, expr: string) => {
    const [body, filter] = expr.split("|").map((s) => s.trim());
    let value: unknown;
    const div = body.split("/").map((s) => s.trim());
    if (div.length === 2) {
      const a = Number(get(root, div[0]));
      const b = Number(get(root, div[1]));
      value = b ? a / b : undefined;
    } else {
      value = get(root, body);
    }
    if (value == null || (typeof value === "number" && !Number.isFinite(value))) return "n/a";
    if (filter && FILTERS[filter]) return FILTERS[filter](Number(value));
    return String(value);
  });
}

/** Renders placeholders inside tool arguments (dates). */
export function renderArgs(args: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(args).map(([k, v]) => [k, typeof v === "string" ? render(v) : v]));
}
