import { getPool } from "@/lib/db/client";

export const dynamic = "force-dynamic";

// Used by the load balancer. Open even when the staging password is on.
export async function GET() {
  try {
    await getPool().query("SELECT 1");
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
