"use client";

import { useMemo, useRef, useState } from "react";

interface Day {
  date: string;
  sessions: number;
}

const W = 720;
const H = 260;
const PAD = { top: 16, right: 12, bottom: 28, left: 48 };

function niceMax(v: number) {
  const step = Math.pow(10, Math.floor(Math.log10(v || 1)));
  return Math.ceil(v / step) * step;
}

const fmt = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function SessionsChart({ days }: { days: Day[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const geo = useMemo(() => {
    const max = niceMax(Math.max(...days.map((d) => d.sessions), 1));
    const iw = W - PAD.left - PAD.right;
    const ih = H - PAD.top - PAD.bottom;
    const x = (i: number) => PAD.left + (days.length < 2 ? iw / 2 : (i / (days.length - 1)) * iw);
    const y = (v: number) => PAD.top + ih - (v / max) * ih;
    const line = days.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.sessions).toFixed(1)}`).join("");
    const area = `${line}L${x(days.length - 1)},${y(0)}L${x(0)},${y(0)}Z`;
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(max * t));
    const labelEvery = Math.max(1, Math.ceil(days.length / 6));
    return { x, y, line, area, ticks, labelEvery };
  }, [days]);

  if (!days.length) return <p className="muted">No GA4 data yet. Run a sync on the Data page.</p>;

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - PAD.left) / (W - PAD.left - PAD.right)) * (days.length - 1));
    setHover(Math.min(days.length - 1, Math.max(0, i)));
  };

  const h = hover == null ? null : days[hover];
  return (
    <div style={{ position: "relative" }}>
      <svg ref={svgRef} className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Daily sessions">
        {geo.ticks.map((t) => (
          <g key={t}>
            <line className="grid-line" x1={PAD.left} x2={W - PAD.right} y1={geo.y(t)} y2={geo.y(t)} />
            <text x={PAD.left - 8} y={geo.y(t) + 4} textAnchor="end">
              {t.toLocaleString("en-US")}
            </text>
          </g>
        ))}
        {days.map((d, i) =>
          i % geo.labelEvery === 0 ? (
            <text key={d.date} x={geo.x(i)} y={H - 8} textAnchor="middle">
              {fmt(d.date)}
            </text>
          ) : null,
        )}
        <path className="series-area" d={geo.area} />
        <path className="series-line" d={geo.line} />
        {h && hover != null && (
          <>
            <line className="crosshair" x1={geo.x(hover)} x2={geo.x(hover)} y1={PAD.top} y2={H - PAD.bottom} />
            <circle className="dot" cx={geo.x(hover)} cy={geo.y(h.sessions)} r={5} />
          </>
        )}
        <rect x={PAD.left} y={PAD.top} width={W - PAD.left - PAD.right} height={H - PAD.top - PAD.bottom} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
      </svg>
      {h && hover != null && (
        <div className="tooltip" style={{ left: `${(geo.x(hover) / W) * 100}%`, top: `${(geo.y(h.sessions) / H) * 100}%` }}>
          {fmt(h.date)}: <b>{h.sessions.toLocaleString("en-US")}</b> sessions
        </div>
      )}
    </div>
  );
}
