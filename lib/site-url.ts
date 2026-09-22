const LOCAL_URL = "http://localhost:3000";

function normalizeUrl(value: string | undefined): URL | null {
  const candidate = value?.trim();
  if (!candidate) return null;

  if (
    /^[a-z][a-z\d+.-]*:\/\//i.test(candidate) &&
    !/^https?:\/\//i.test(candidate)
  )
    return null;
  const withProtocol = /^https?:\/\//i.test(candidate)
    ? candidate
    : `${candidate.startsWith("localhost") ? "http" : "https"}://${candidate}`;

  try {
    const url = new URL(withProtocol);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    return new URL(url.origin);
  } catch {
    return null;
  }
}

export function getSiteUrl(): URL {
  const configured = normalizeUrl(process.env.NEXT_PUBLIC_SITE_URL);
  const vercel =
    normalizeUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL) ||
    normalizeUrl(process.env.VERCEL_URL);

  if (
    process.env.VERCEL &&
    configured &&
    ["localhost", "127.0.0.1", "[::1]"].includes(configured.hostname)
  ) {
    return vercel || new URL(LOCAL_URL);
  }

  return configured || vercel || new URL(LOCAL_URL);
}
