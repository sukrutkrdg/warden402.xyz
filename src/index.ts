import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { guardToken } from "./routes/guardToken.js";

const app = new Hono();

app.get("/", (c) =>
  c.json({
    name: "Warden",
    tagline: "Pre-execution security & trust layer for agents on Base",
    site: "https://warden402.xyz",
    schemaVersion: "0",
    endpoints: ["GET /health", "GET /guard/token?address=0x..&chainId=8453"],
  }),
);

app.get("/health", (c) => c.json({ ok: true, ts: new Date().toISOString() }));

// Flagship
app.route("/", guardToken);

// TODO: x402 ödeme middleware'i buraya (free tier: ilk N çağrı bedava, sonra 402).
// TODO: /guard/tx ve /guard/address (Faz 2).
// TODO: MCP server sarmalayıcı (Faz 1 sonu).

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Warden dinliyor → http://localhost:${info.port}`);
});
