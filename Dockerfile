# One Dockerfile, three targets:
#   app    the Next.js web app        (docker build --target app .)
#   mcp    the read-only MCP server   (docker build --target mcp .)
#   tools  full source and dev tools, used by docker compose to migrate and seed
# syntax=docker/dockerfile:1

FROM node:22.22.0-alpine3.22 AS deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci --no-audit --no-fund

FROM deps AS tools
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1

FROM tools AS build
RUN npm run build

# ---------------------------------------------------------------- app
FROM node:22.22.0-alpine3.22 AS app
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/dist/scripts ./dist/scripts
COPY --from=build --chown=app:app /app/db/migrations ./db/migrations
COPY --from=build --chown=app:app /app/fixtures ./fixtures
COPY --chown=app:app docker/start-app.sh ./start-app.sh
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["sh", "./start-app.sh"]

# ---------------------------------------------------------------- mcp
FROM node:22.22.0-alpine3.22 AS mcp
WORKDIR /app
ENV NODE_ENV=production MCP_PORT=3001
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/dist/mcp ./dist/mcp
# The SQL parser ships WebAssembly, so it is copied as a package instead of bundled.
COPY --from=build --chown=app:app /app/node_modules/libpg-query ./node_modules/libpg-query
COPY --from=build --chown=app:app /app/node_modules/@pgsql ./node_modules/@pgsql
USER app
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3001/healthz || exit 1
CMD ["node", "dist/mcp/server.mjs"]
