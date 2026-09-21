import type { MetadataRoute } from "next";
export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return ["", "/pedir", "/privacidade", "/termos"].map((route) => ({
    url: `${base}${route}`,
    changeFrequency: "monthly",
    priority: route ? 0.6 : 1,
  }));
}
