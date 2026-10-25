import { auth } from "@/auth";
import { listTools } from "@/lib/console/ask";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await auth())?.user) return Response.json({ error: "Sign in required" }, { status: 401 });
  try {
    return Response.json({ tools: await listTools() });
  } catch {
    return Response.json({ error: "The connector could not be reached." }, { status: 502 });
  }
}
