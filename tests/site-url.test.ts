import { afterEach, describe, expect, it, vi } from "vitest";
import { getSiteUrl } from "@/lib/site-url";

afterEach(() => vi.unstubAllEnvs());

describe("metadata origins", () => {
  it.each([
    "ftp://files.example",
    "https://user:password@example.com",
    "https://invalid host",
  ])("falls back from an unusable configured origin: %s", (url) => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", url);
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "jola.example");
    expect(getSiteUrl().href).toBe("https://jola.example/");
  });
  it("uses the preview host when the production host is malformed", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "https://bad host");
    vi.stubEnv("VERCEL_URL", "jola-preview.vercel.app");
    expect(getSiteUrl().href).toBe("https://jola-preview.vercel.app/");
  });
  it("removes paths, query strings and fragments from the metadata origin", () => {
    vi.stubEnv(
      "NEXT_PUBLIC_SITE_URL",
      "https://jola.example/pedir?utm_source=test#packs",
    );
    expect(getSiteUrl().href).toBe("https://jola.example/");
  });
});
