import { Hono } from "hono";
import { cors } from "hono/cors";
import { guardToken } from "./routes/guardToken.js";
import { guardTx } from "./routes/guardTx.js";
import { guardAddress } from "./routes/guardAddress.js";
import { trackRecord } from "./routes/trackRecord.js";

/** Warden Hono app — hem lokal node sunucusu hem Vercel serverless tarafından kullanılır. */
export const app = new Hono();

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

app.route("/", guardToken);
app.route("/", guardTx);
app.route("/", guardAddress);
app.route("/", trackRecord);

export default app;
