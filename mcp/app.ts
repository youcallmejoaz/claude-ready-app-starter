import http from "node:http";
import pg from "pg";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { writeAudit } from "./audit";
import { bearerFrom, verifyToken } from "./auth";
import { registerTools } from "./tools";

export interface McpAppOptions {
  readonlyUrl: string;
  auditUrl: string;
}

const MAX_BODY_BYTES = 1_000_000;

function clientIp(req: http.IncomingMessage): string | undefined {
  const fwd = req.headers["x-forwarded-for"];
  const first = Array.isArray(fwd) ? fwd[0] : fwd?.split(",")[0];
  return first?.trim() || req.socket.remoteAddress || undefined;
}

function sendJson(res: http.ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(body));
}

async function readJson(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new Error("Request body too large");
    chunks.push(chunk as Buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : undefined;
}

function methodsOf(body: unknown): string {
  const list = Array.isArray(body) ? body : [body];
  return list.map((m) => (m && typeof m === "object" && "method" in m ? String((m as { method: unknown }).method) : "?")).join(",");
}

export function createMcpApp(opts: McpAppOptions) {
  // Two pools, two roles. Queries never run with audit permissions and vice versa.
  const readonlyPool = new pg.Pool({ connectionString: opts.readonlyUrl, max: 10 });
  const auditPool = new pg.Pool({ connectionString: opts.auditUrl, max: 5 });

  const handler = async (req: http.IncomingMessage, res: http.ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://localhost");

    if (url.pathname === "/healthz") return sendJson(res, 200, { ok: true });
    if (url.pathname !== "/mcp") return sendJson(res, 404, { error: "Not found" });

    const ip = clientIp(req);
    const token = await verifyToken(auditPool, bearerFrom(req.headers.authorization)).catch(() => undefined);
    if (!token) {
      await writeAudit(auditPool, { method: `${req.method} /mcp`, status: "unauthorized", reason: "Missing, invalid or revoked token", clientIp: ip }).catch(() => undefined);
      return sendJson(
        res,
        401,
        { jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized: a valid bearer token is required" }, id: null },
        { "www-authenticate": 'Bearer realm="mcp"' },
      );
    }

    // Stateless mode: each POST is self-contained, so there are no sessions to hijack or leak.
    if (req.method !== "POST") {
      return sendJson(res, 405, { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null }, { allow: "POST" });
    }

    let body: unknown;
    try {
      body = await readJson(req);
    } catch (err) {
      return sendJson(res, 400, { jsonrpc: "2.0", error: { code: -32700, message: err instanceof Error ? err.message : "Parse error" }, id: null });
    }

    const method = methodsOf(body);
    if (!method.includes("tools/call")) {
      // tools/call writes its own, richer audit row inside the tool wrapper.
      await writeAudit(auditPool, { tokenId: token.id, tokenName: token.name, method, status: "ok", clientIp: ip }).catch(() => undefined);
    }

    const server = new McpServer({ name: "readonly-analytics", version: "1.0.0" });
    registerTools(server, { readonlyPool, auditPool, token, clientIp: ip });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  };

  return {
    handler: (req: http.IncomingMessage, res: http.ServerResponse) => {
      handler(req, res).catch((err) => {
        console.error("MCP request failed", err);
        if (!res.headersSent) sendJson(res, 500, { jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null });
      });
    },
    async close() {
      await Promise.all([readonlyPool.end(), auditPool.end()]);
    },
  };
}
