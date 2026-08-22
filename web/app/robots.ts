import type { MetadataRoute } from "next";
import { getSiteUrl } from "./lib/site";

export default function robots(): MetadataRoute.Robots {
  const site = getSiteUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // /api is machine surface (and the source of the /llms.txt and
        // /.well-known/* rewrites) — crawling it only creates duplicates.
        disallow: ["/admin", "/api/"],
      },
    ],
    sitemap: `${site}/sitemap.xml`,
    host: site,
  };
}
