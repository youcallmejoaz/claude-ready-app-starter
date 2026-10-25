"use client";

import { Fragment, useEffect, useState } from "react";
import type { ConsoleAnswer, ConsoleStep, ToolInfo } from "@/lib/console/ask";

/** Renders **bold** and paragraphs without injecting HTML. */
function Prose({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n{2,}/).map((para, i) => (
        <p key={i}>
          {para.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
            part.startsWith("**") && part.endsWith("**") ? <strong key={j}>{part.slice(2, -2)}</strong> : <Fragment key={j}>{part}</Fragment>,
          )}
        </p>
      ))}
    </>
  );
}

const MONEY_COLS = new Set(["cost", "cpc", "cost_per_conversion"]);

function cell(col: string, v: unknown): string {
  if (v == null) return "-";
  if (typeof v === "number") {
    if (MONEY_COLS.has(col)) return v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
    if (col === "ctr" || col === "conversion_rate") return `${v.toFixed(1)}%`;
    return v.toLocaleString("en-US");
  }
  return String(v);
}

// Keep the table readable; the full result is still what the tool returned.
const HIDDEN = new Set(["campaign_id", "channel_type", "impressions", "cpc", "users"]);

function ResultView({ step }: { step: ConsoleStep }) {
  const r = step.result as { rows?: Record<string, unknown>[]; totals?: Record<string, unknown>; tables?: { table: string; description: string | null }[] } | string;
  if (typeof r === "string") return <pre style={{ color: step.isError ? "var(--bad)" : undefined }}>{r}</pre>;
  if (r?.rows?.length) {
    const cols = Object.keys(r.rows[0]).filter((c) => !HIDDEN.has(c));
    return (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c} className={typeof r.rows![0][c] === "number" ? "num" : undefined}>
                  {c.replace(/_/g, " ")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {r.rows.slice(0, 10).map((row, i) => (
              <tr key={i}>
                {cols.map((c) => (
                  <td key={c} className={typeof row[c] === "number" ? "num" : undefined}>
                    {cell(c, row[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (r?.totals) {
    return (
      <div className="row" style={{ gap: 24 }}>
        {Object.entries(r.totals).map(([k, v]) => (
          <div key={k}>
            <div className="stat-label">{k.replace(/_/g, " ")}</div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>{cell(k, v)}</div>
          </div>
        ))}
      </div>
    );
  }
  if (r?.tables) {
    return (
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {r.tables.map((t) => (
          <li key={t.table}>
            <span className="mono">{t.table}</span> <span className="muted">{t.description}</span>
          </li>
        ))}
      </ul>
    );
  }
  return <pre>{JSON.stringify(r, null, 2)}</pre>;
}

function argsText(args: Record<string, unknown>) {
  if (typeof args.sql === "string") return args.sql;
  return Object.entries(args)
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(", ");
}

export function Console({ suggestions, live }: { suggestions: string[]; live: boolean }) {
  const [tools, setTools] = useState<ToolInfo[] | null>(null);
  const [toolsError, setToolsError] = useState(false);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ConsoleAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/console/tools")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setTools(d.tools))
      .catch(() => setToolsError(true));
  }, []);

  const submit = async (q: string) => {
    if (!q.trim()) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/console/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: q }) });
      const body = await res.json();
      if (!res.ok) setError(body.error ?? "Something went wrong.");
      else setResult(body);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="console-grid">
      <aside className="card">
        <div className="card-head">
          <h2>Connector tools</h2>
          <span className={`chip ${live ? "chip-good" : "chip-warn"}`}>{live ? "Live Claude" : "Recorded"}</span>
        </div>
        {toolsError && <p className="chip chip-bad">Connector unreachable</p>}
        {!tools && !toolsError && <p className="muted">Connecting…</p>}
        {tools && (
          <ul className="tool-list" data-testid="tool-list">
            {tools.map((t) => (
              <li key={t.name}>
                <div className="name">{t.name}</div>
                <div className="desc">{t.description}</div>
              </li>
            ))}
          </ul>
        )}
        <p className="muted" style={{ fontSize: 12.5, marginTop: 14 }}>
          Read only. Every call is checked, limited to 500 rows and 5 seconds, and written to the audit log.
        </p>
      </aside>

      <section className="card">
        <form
          className="ask"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(question);
          }}
        >
          <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask about your marketing data…" aria-label="Question" data-testid="question" />
          <button className="btn btn-primary" type="submit" disabled={busy} data-testid="ask">
            {busy ? "Asking…" : "Ask"}
          </button>
        </form>
        <div className="suggestions">
          {suggestions.map((s) => (
            <button key={s} type="button" className="suggestion" onClick={() => setQuestion(s)}>
              {s}
            </button>
          ))}
        </div>

        {busy && <p className="thinking">Claude is calling the connector…</p>}
        {error && <p className="chip chip-bad" style={{ marginTop: 14 }}>{error}</p>}

        {result && (
          <div data-testid="result" style={{ marginTop: 18 }}>
            <p className="question">{result.question}</p>
            {result.steps.map((s, i) => (
              <div key={i} className="step" data-testid="step">
                <div className="step-head">
                  <span className="chip chip-neutral">Tool call</span>
                  <span className="mono" style={{ fontWeight: 600 }}>{s.tool}</span>
                  <span className="mono muted">{argsText(s.args)}</span>
                  <span style={{ marginLeft: "auto" }} className={`chip ${s.isError ? "chip-bad" : "chip-good"}`}>
                    {s.isError ? "✕ Blocked" : "✓ Result"}
                  </span>
                </div>
                <div className="step-body">
                  <ResultView step={s} />
                </div>
              </div>
            ))}
            <div className={`answer${result.blocked ? " blocked" : ""}`} data-testid="answer">
              <Prose text={result.answer} />
            </div>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
              {result.mode === "recorded"
                ? "Recorded answer (demo mode): the wording was prepared in advance; the tool calls above ran live on the connector just now."
                : "Live answer from Claude, using the tool calls above."}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
