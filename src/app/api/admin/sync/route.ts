import { after } from "next/server";
import { auth } from "@/auth";
import { isSyncRunning, syncAll } from "@/lib/sync/run";

export const dynamic = "force-dynamic";

// "Sync now" button. Starts the sync in the background and returns straight away;
// the admin page polls /api/admin/status to show progress.
export async function POST() {
  if (!(await auth())?.user) return Response.json({ error: "Sign in required" }, { status: 401 });
  if (await isSyncRunning()) return Response.json({ started: false, reason: "A sync is already running" }, { status: 409 });
  after(async () => {
    await syncAll();
  });
  return Response.json({ started: true }, { status: 202 });
}
