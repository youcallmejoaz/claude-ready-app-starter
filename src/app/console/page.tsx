import { TopBar } from "@/components/TopBar";
import { Console } from "@/components/Console";
import { liveModeAvailable, SUGGESTED_QUESTIONS } from "@/lib/console/ask";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ConsolePage() {
  const user = await requireUser();
  const live = liveModeAvailable();
  return (
    <>
      <TopBar current="/console" userName={user.name} />
      <main className="page">
        <div className="page-head">
          <div>
            <h1>Ask Claude about your data</h1>
            <p className="sub">This page talks to the same read-only connector Claude uses. You see every tool call and its result.</p>
          </div>
        </div>
        {!live && (
          <>
            <div className="banner">
              <span className="chip chip-warn">Demo mode</span>
              Answers are recorded, not live Claude replies. The tool calls run for real. Set ANTHROPIC_API_KEY and DEMO_MODE=0 for live answers.
            </div>
            <div className="spacer" />
          </>
        )}
        <Console suggestions={SUGGESTED_QUESTIONS.slice(0, 4)} live={live} />
      </main>
    </>
  );
}
