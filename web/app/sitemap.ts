import type { MetadataRoute } from "next";
import { getSiteUrl } from "./lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const site = getSiteUrl();
  const now = new Date();
  const pages = ["", "/firewall", "/pricing", "/onboard", "/account", "/track-record", "/dashboard"];
  return pages.map((p) => ({
    url: `${site}${p}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: p === "" ? 1 : 0.7,
  }));
}
