import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site-url";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteUrl();
  return ["", "/pedir", "/privacidade", "/termos"].map((route) => ({
    url: new URL(route || "/", base).toString(),
    changeFrequency: "monthly",
    priority: route ? 0.6 : 1,
  }));
}
