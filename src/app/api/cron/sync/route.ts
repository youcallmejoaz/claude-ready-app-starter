import { env } from "@/lib/env";
import { safeEqual } from "@/lib/basic-auth";
import { syncAll } from "@/lib/sync/run";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Nightly sync trigger for a scheduler (for example Amazon EventBridge Scheduler or a
// GitHub Actions cron). Requires "Authorization: Bearer <CRON_SECRET>".
export async function POST(request: Request) {
  const secret = env.cronSecret;
  const given = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!secret || !safeEqual(given, secret)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const days = Number(new URL(request.url).searchParams.get("days")) || 3;
  const results = await syncAll({ days });
  const ok = results.every((r) => r.status === "ok");
  return Response.json({ ok, results }, { status: ok ? 200 : 500 });
}
