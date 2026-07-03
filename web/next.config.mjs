import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @warden/core lives at the repo root (packages/core) → transpile it + set the
  // file-tracing root to the repo root so the workspace package is included.
  transpilePackages: ["@warden/core"],
  outputFileTracingRoot: join(here, ".."),
  // @warden/core is NodeNext (uses ".js" specifiers pointing at ".ts" sources);
  // teach webpack to resolve ".js" → ".ts" so those imports resolve.
  webpack: (config) => {
    config.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"], ...config.resolve.extensionAlias };
    return config;
  },
  async rewrites() {
    return [
      // Farcaster / Base App Mini App manifest at the well-known path.
      { source: "/.well-known/farcaster.json", destination: "/api/farcaster-manifest" },
      // Agent / AI discovery.
      { source: "/llms.txt", destination: "/api/llms" },
      { source: "/.well-known/mcp.json", destination: "/api/well-known-mcp" },
      { source: "/.well-known/x402", destination: "/api/well-known-x402" },
    ];
  },
};
export default nextConfig;
