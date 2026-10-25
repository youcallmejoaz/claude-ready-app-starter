import { z } from "zod";
import { auth } from "@/auth";
import { ask } from "@/lib/console/ask";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const Body = z.object({ question: z.string().trim().min(1).max(500) });

export async function POST(request: Request) {
  if (!(await auth())?.user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ask a question (500 characters max)." }, { status: 400 });
  try {
    return Response.json(await ask(parsed.data.question));
  } catch (err) {
    console.error("Console request failed", err);
    return Response.json({ error: "The connector could not be reached. Is the MCP server running?" }, { status: 502 });
  }
}
