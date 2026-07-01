import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // web/ kendi başına bir Next app; trace kökünü buraya sabitle (çoklu lockfile uyarısını giderir).
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
  async rewrites() {
    return [
      // Farcaster / Base App Mini App manifest at the well-known path.
      { source: "/.well-known/farcaster.json", destination: "/api/farcaster-manifest" },
      // Agent / AI discovery.
      { source: "/llms.txt", destination: "/api/llms" },
      { source: "/.well-known/mcp.json", destination: "/api/well-known-mcp" },
    ];
  },
};
export default nextConfig;
