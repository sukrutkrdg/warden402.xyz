import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { guardToken } from "./routes/guardToken.js";
import { guardTx } from "./routes/guardTx.js";
import { guardAddress } from "./routes/guardAddress.js";
import { trackRecord } from "./routes/trackRecord.js";

const app = new Hono();

app.use("*", cors());

app.get("/", (c) =>
  c.json({
    name: "Warden",
    tagline: "Pre-execution security & trust layer for agents on Base",
    site: "https://warden402.xyz",
    schemaVersion: "0",
    endpoints: [
      "GET  /health",
      "GET  /guard/token?address=0x..&chainId=8453",
      "POST /guard/tx           { from, to, calldata, value? }",
      "GET  /guard/address?address=0x..&chainId=8453",
      "GET  /track-record",
    ],
  }),
);

app.get("/health", (c) => c.json({ ok: true, ts: new Date().toISOString() }));

// Flagship + pre-sign + counterparty
app.route("/", guardToken);
app.route("/", guardTx);
app.route("/", guardAddress);
app.route("/", trackRecord);

// TODO: x402 ödeme middleware'i (free tier: ilk N çağrı bedava, sonra 402).
// TODO: MCP server sarmalayıcı.

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Warden dinliyor → http://localhost:${info.port}`);
});
