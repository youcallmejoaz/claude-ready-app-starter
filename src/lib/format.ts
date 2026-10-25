const money0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const money2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const int = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export const fmtMoney = (n: number | null | undefined, cents = false) => (n == null ? "-" : (cents ? money2 : money0).format(n));
export const fmtInt = (n: number | null | undefined) => (n == null ? "-" : int.format(n));
export const fmtPct = (n: number | null | undefined) => (n == null ? "-" : `${n.toFixed(1)}%`);
export const fmtDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
export const fmtDateTime = (d: Date | string | null | undefined) =>
  d == null
    ? "never"
    : new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", timeZone: "UTC" }) + " UTC";
