import type { NextConfig } from "next";
const config: NextConfig = {
  // Give browser tests a separate lock/cache when the developer's server is open.
  distDir:
    process.env.RUVON_BROWSER_TEST === "true" ? ".next-playwright" : ".next",
  typescript:
    process.env.RUVON_BROWSER_TEST === "true"
      ? { tsconfigPath: "tsconfig.browser-tests.json" }
      : undefined,
  poweredByHeader: false,
  turbopack: { root: process.cwd() },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};
export default config;
