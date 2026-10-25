// Bundles the MCP server and the operational scripts into dist/ for the Docker images.
// libpg-query stays external because it ships a WebAssembly file next to its code.
import { build } from "esbuild";

const shared = {
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  tsconfig: "tsconfig.json",
  external: ["libpg-query"],
  // Some bundled CommonJS packages call require(); give the ESM bundle one.
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: "info",
};

await build({ ...shared, entryPoints: ["mcp/server.ts"], outfile: "dist/mcp/server.mjs" });
await build({
  ...shared,
  entryPoints: ["scripts/migrate.ts", "scripts/seed.ts", "scripts/sync.ts", "scripts/token.ts"],
  outdir: "dist/scripts",
  outExtension: { ".js": ".mjs" },
});
