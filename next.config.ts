import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // Markdown files rendered by /docs are read at runtime, so ship them with the server.
  outputFileTracingIncludes: { "/docs/[slug]": ["./CLAUDE.md", "./docs/HOW_TO_DEPLOY.md"] },
};

export default nextConfig;
