# MCP server (warden402-mcp) — stdio. Used by Glama / registries to start the
# server and introspect its tools. Set WARDEN_AGENT_KEY to also expose the
# firewall tools; guard tools work without any key.
FROM node:20-alpine
WORKDIR /app
COPY mcp/package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY mcp/src ./src
ENV NODE_ENV=production
ENTRYPOINT ["node", "src/index.mjs"]
