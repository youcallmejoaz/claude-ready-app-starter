import { NextResponse, type NextRequest } from "next/server";
import { isAuthorized, UNAUTHORIZED_HTML } from "@/lib/basic-auth";

// Staging password. With STAGING_BASIC_AUTH=1 every page and API route needs the staging
// username and password, except the health check the load balancer uses.
export function proxy(request: NextRequest) {
  if (process.env.STAGING_BASIC_AUTH !== "1") return NextResponse.next();
  if (request.nextUrl.pathname === "/api/health") return NextResponse.next();

  const ok = isAuthorized(
    request.headers.get("authorization"),
    process.env.BASIC_AUTH_USER ?? "",
    process.env.BASIC_AUTH_PASSWORD ?? "",
  );
  if (ok) return NextResponse.next();

  return new NextResponse(UNAUTHORIZED_HTML, {
    status: 401,
    headers: {
      "www-authenticate": 'Basic realm="staging", charset="UTF-8"',
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

// Runs on every request, static files included: nothing on staging is public.
