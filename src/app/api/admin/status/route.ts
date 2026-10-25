import { auth } from "@/auth";
import { getSyncStatus } from "@/lib/sync/status";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await auth())?.user) return Response.json({ error: "Sign in required" }, { status: 401 });
  return Response.json(await getSyncStatus());
}
