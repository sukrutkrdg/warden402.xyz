# Distributing warden402-mcp

Everything is prepared; publishing needs your npm + registry auth. Run these from `mcp/`.

## 1. Publish to npm
```bash
cd mcp
npm login
npm publish --access public
```
Now `npx -y warden402-mcp` works for everyone (no keys required).

## 2. MCP Registry (modelcontextprotocol)
`server.json` is ready. Publish with the official publisher:
```bash
npx -y @modelcontextprotocol/publisher publish   # or: mcp-publisher publish
```
Requires GitHub auth for the `io.github.sukrutkrdg/*` namespace. Lists it in the
public MCP Registry that agent clients browse.

## 3. Smithery
`smithery.yaml` is ready. Connect the repo at https://smithery.ai (point it at the
`mcp` directory if it scans the repo root). No secrets to configure — installs clean.

## 4. Agentic.Market / Base App
- Submit the Mini App on base.dev (manifest already live at
  `https://warden402.xyz/.well-known/farcaster.json`).
- List the MCP server / API on Coinbase's Agentic.Market as a safety tool. Pitch:
  "drop-in pre-execution safety — agents call guard_token/guard_tx/guard_address
  before they act; block·review·clear."

## 5. Client config (what users paste)
```json
{
  "mcpServers": {
    "warden402": { "command": "npx", "args": ["-y", "warden402-mcp"] }
  }
}
```
