import Link from "next/link";
import { signOut } from "@/auth";
import { env } from "@/lib/env";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/admin", label: "Data & connector" },
  { href: "/console", label: "Ask Claude" },
  { href: "/docs/claude-md", label: "Project guide" },
];

export function TopBar({ current, userName }: { current: string; userName?: string | null }) {
  return (
    <header className="topbar">
      <Link href="/" className="brand">
        <span className="brand-mark" aria-hidden>
          ◆
        </span>
        Claude Ready App
      </Link>
      <nav className="nav">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} aria-current={current === l.href ? "page" : undefined}>
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="topbar-right">
        {env.demoMode && <span className="chip chip-warn">Demo mode, sample data</span>}
        <span>{userName}</span>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/signin" });
          }}
        >
          <button className="btn btn-sm" type="submit">
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
