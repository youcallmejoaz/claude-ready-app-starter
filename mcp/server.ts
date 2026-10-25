// Read-only analytics MCP server (Streamable HTTP at /mcp). Run: npm run mcp
import http from "node:http";
import { createMcpApp } from "./app";
import { env } from "../src/lib/env";

const app = createMcpApp({ readonlyUrl: env.mcpReadonlyDatabaseUrl, auditUrl: env.mcpAuditDatabaseUrl });
const server = http.createServer(app.handler);
server.listen(env.mcpPort, () => {
  console.log(`MCP server listening on http://localhost:${env.mcpPort}/mcp`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => void app.close().then(() => process.exit(0)));
  });
}
