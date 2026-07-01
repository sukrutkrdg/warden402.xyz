export const dynamic = "force-dynamic";

// Served at /.well-known/mcp.json (via rewrite) — MCP discovery for agent clients.
export function GET() {
  return Response.json({
    name: "warden402",
    description: "Pre-execution safety for agents on Base: guard a token, transaction or address -> block/review/clear before you act.",
    homepage: "https://warden402.xyz",
    repository: "https://github.com/sukrutkrdg/warden402.xyz",
    registry: "io.github.sukrutkrdg/warden402-mcp",
    install: { command: "npx", args: ["-y", "warden402-mcp"] },
    tools: ["guard_token", "guard_tx", "guard_address"],
    tags: ["security", "x402", "base", "agents", "defi"],
  });
}
