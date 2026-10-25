import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if ((await auth())?.user) redirect("/");
  const { error } = await searchParams;
  const demo = env.demoMode;
  const googleReady = env.googleAuthConfigured;

  return (
    <main className="signin">
      <div className="card signin-card">
        <span className="brand-mark" style={{ width: 44, height: 44, fontSize: 22, margin: "0 auto", borderRadius: 11 }} aria-hidden>
          ◆
        </span>
        <h1>Sign in to your dashboard</h1>
        <p className="sub">Your Google Ads and Analytics numbers, in your own database.</p>
        {error && <p className="chip chip-bad" style={{ marginTop: 16 }}>Sign in failed. Is this account allowed?</p>}
        <form
          action={async () => {
            "use server";
            await signIn(demo ? "demo" : "google", { redirectTo: "/" });
          }}
        >
          <button className="btn google-btn" type="submit" disabled={!demo && !googleReady}>
            Sign in with Google
          </button>
        </form>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 14 }}>
          {demo
            ? "Demo mode: this is a mock Google sign-in with a sample account."
            : googleReady
              ? "Only approved Google accounts can sign in."
              : "Google sign-in is not configured yet. Set AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET."}
        </p>
      </div>
    </main>
  );
}
