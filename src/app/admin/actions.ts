"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { getDb } from "@/lib/db/client";
import { mcpTokens } from "@/lib/db/schema";
import { generateToken, hashToken } from "@/lib/mcp-tokens";

async function requireSignedIn() {
  if (!(await auth())?.user) throw new Error("Sign in required");
}

export async function createTokenAction(_prev: { token?: string; name?: string } | null, form: FormData) {
  await requireSignedIn();
  const name = String(form.get("name") ?? "").trim().slice(0, 60) || "Claude";
  const token = generateToken();
  await getDb().insert(mcpTokens).values({ name, tokenHash: hashToken(token) });
  revalidatePath("/admin");
  // Returned once to this browser and never stored in plain text.
  return { token, name };
}

export async function revokeTokenAction(form: FormData) {
  await requireSignedIn();
  const id = String(form.get("id") ?? "");
  await getDb().update(mcpTokens).set({ revokedAt: new Date() }).where(eq(mcpTokens.id, id));
  revalidatePath("/admin");
}
