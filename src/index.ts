import { serve } from "@hono/node-server";
import { app } from "./app.js";

// Lokal / Node host (Render, Railway, Fly, vb.) için sunucu.
const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Warden dinliyor → http://localhost:${info.port}`);
});
