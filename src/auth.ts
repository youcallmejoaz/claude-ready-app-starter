import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { getDb } from "@/lib/db/client";
import { accounts, sessions, users, verificationTokens } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { DEMO_USER } from "@/lib/demo-user";


function providers(): NextAuthConfig["providers"] {
  const list: NextAuthConfig["providers"] = [];
  if (env.googleAuthConfigured) {
    // Sign-in only needs openid, email and profile. The data sync uses its own credentials
    // (see docs/GOOGLE_DATA.md), so a user signing in never grants Ads or Analytics access.
    list.push(Google);
  }
  if (env.demoMode) {
    // Demo mode: a mock "Sign in with Google" that signs in the seeded demo user.
    // Never enabled when DEMO_MODE=0.
    list.push(
      Credentials({
        id: "demo",
        name: "Demo",
        credentials: {},
        authorize: async () => DEMO_USER,
      }),
    );
  }
  return list;
}

export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  adapter: DrizzleAdapter(getDb(), {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  // JWT sessions: required for the demo provider, and keeps the session table empty.
  session: { strategy: "jwt" },
  providers: providers(),
  pages: { signIn: "/signin" },
  trustHost: true,
  callbacks: {
    signIn({ user, account }) {
      if (account?.provider === "demo") return env.demoMode;
      const allowed = env.allowedEmails;
      // With AUTH_ALLOWED_EMAILS set, only those Google accounts can sign in.
      if (allowed.length && !allowed.includes((user.email ?? "").toLowerCase())) return false;
      return true;
    },
  },
}));
