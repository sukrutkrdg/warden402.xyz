import { Hono } from "hono";
import { cors } from "hono/cors";
import { guardToken } from "./routes/guardToken.js";
import { guardTx } from "./routes/guardTx.js";
import { guardAddress } from "./routes/guardAddress.js";
import { trackRecord } from "./routes/trackRecord.js";
import { firewall } from "./routes/firewall.js";
import { guardPaymentGate } from "./x402/gate.js";

/** Warden Hono app — hem lokal node sunucusu hem Vercel serverless tarafından kullanılır. */
export const app = new Hono();

app.use("*", cors());

// x402 payment gate on the paid guard endpoints (free + unlimited until
// PAYMENTS_ENABLED=true with CDP keys; see src/x402/config.ts).
app.use("/guard/*", guardPaymentGate);

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
      "POST /firewall/check     { kind, to, amountUsd?, calldata? }  (x-warden-agent-key)",
      "GET  /firewall/state",
      "GET  /firewall/audit",
    ],
  }),
);

app.get("/health", (c) => c.json({ ok: true, ts: new Date().toISOString() }));

app.route("/", guardToken);
app.route("/", guardTx);
app.route("/", guardAddress);
app.route("/", trackRecord);
app.route("/", firewall);

export default app;
