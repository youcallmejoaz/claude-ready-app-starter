import { describe, expect, it, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { isAuthorized, parseBasicAuth } from "@/lib/basic-auth";
import { proxy } from "@/proxy";

const header = (u: string, p: string) => `Basic ${btoa(`${u}:${p}`)}`;

describe("basic auth helpers", () => {
  it("parses a header", () => {
    expect(parseBasicAuth(header("team", "p:ss"))).toEqual({ user: "team", password: "p:ss" });
    expect(parseBasicAuth("Bearer abc")).toBeUndefined();
    expect(parseBasicAuth(undefined)).toBeUndefined();
  });

  it("fails closed when no password is configured", () => {
    expect(isAuthorized(header("", ""), "", "")).toBe(false);
  });
});

describe("staging proxy", () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  const req = (path: string, auth?: string) =>
    new NextRequest(new URL(path, "http://staging.local"), { headers: auth ? { authorization: auth } : {} });

  it("returns 401 without basic auth when the flag is on", () => {
    Object.assign(process.env, { STAGING_BASIC_AUTH: "1", BASIC_AUTH_USER: "team", BASIC_AUTH_PASSWORD: "s3cret" });
    const res = proxy(req("/"));
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toMatch(/^Basic realm="staging"/);
  });

  it("returns 401 with the wrong password", () => {
    Object.assign(process.env, { STAGING_BASIC_AUTH: "1", BASIC_AUTH_USER: "team", BASIC_AUTH_PASSWORD: "s3cret" });
    expect(proxy(req("/admin", header("team", "nope"))).status).toBe(401);
  });

  it("lets the right credentials through", () => {
    Object.assign(process.env, { STAGING_BASIC_AUTH: "1", BASIC_AUTH_USER: "team", BASIC_AUTH_PASSWORD: "s3cret" });
    expect(proxy(req("/admin", header("team", "s3cret"))).status).toBe(200);
  });

  it("keeps the health check open for the load balancer", () => {
    Object.assign(process.env, { STAGING_BASIC_AUTH: "1", BASIC_AUTH_USER: "team", BASIC_AUTH_PASSWORD: "s3cret" });
    expect(proxy(req("/api/health")).status).toBe(200);
  });

  it("does nothing when the flag is off", () => {
    process.env.STAGING_BASIC_AUTH = "0";
    expect(proxy(req("/")).status).toBe(200);
  });
});
