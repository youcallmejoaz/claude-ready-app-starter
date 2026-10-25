"use client";

import { useState } from "react";

interface Row {
  name: string;
  cost: number;
  conversions: number;
  cost_per_conversion: number | null;
}

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n < 100 ? 2 : 0 });

/** Cost per conversion by campaign. One measure, one axis: lower is better. */
export function CampaignBars({ rows }: { rows: Row[] }) {
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(...rows.map((r) => r.cost_per_conversion ?? 0), 1);
  return (
    <div className="bars">
      {rows.map((r) => (
        <div key={r.name} className="bar-row" onPointerEnter={() => setHover(r.name)} onPointerLeave={() => setHover(null)} style={{ position: "relative" }}>
          <span>{r.name}</span>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${((r.cost_per_conversion ?? 0) / max) * 100}%` }} />
          </div>
          <span className="bar-value">{r.cost_per_conversion == null ? "-" : money(r.cost_per_conversion)}</span>
          {hover === r.name && (
            <div className="tooltip" style={{ left: "55%", top: 0 }}>
              {r.name}: {money(r.cost)} spent, {r.conversions.toLocaleString("en-US")} conversions
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
