import type { MetadataRoute } from "next";
import { getSiteUrl } from "./lib/site";

// Only publicly indexable pages belong here. /account, /team and /admin are
// gated surfaces marked noindex — listing them just burns crawl budget.
const PAGES: Array<{ path: string; priority: number; changeFrequency: "daily" | "weekly" | "monthly" }> = [
  { path: "", priority: 1, changeFrequency: "weekly" },
  { path: "/firewall", priority: 0.9, changeFrequency: "weekly" },
  { path: "/pricing", priority: 0.8, changeFrequency: "monthly" },
  { path: "/track-record", priority: 0.8, changeFrequency: "daily" },
  { path: "/onboard", priority: 0.7, changeFrequency: "monthly" },
  { path: "/dashboard", priority: 0.5, changeFrequency: "monthly" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const site = getSiteUrl();
  const now = new Date();
  return PAGES.map((p) => ({
    url: `${site}${p.path}`,
    lastModified: now,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));
}
