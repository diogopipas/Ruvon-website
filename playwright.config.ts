import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/integration",
  testIgnore: [
    "**/commerce-browser.spec.ts",
    "**/operations-browser.spec.ts",
    "**/merchant-commands-browser.spec.ts",
    "**/admin-financial-browser.spec.ts",
  ],
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  reporter: "list",
  use: { baseURL: "http://localhost:3100" },
  webServer: {
    command: "npm run start -- --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 60000,
    env: {
      RUVON_LOCAL_DEMO: "true",
      RUVON_DATA_DIR: ".data/integration",
      ADMIN_PASSWORD: "jola-integration-only",
      SUPABASE_URL: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
      NEXT_PUBLIC_SITE_URL: "http://localhost:3100",
      // Production must retain the waitlist even with an accidentally set flag.
      RUVON_PAYMENTS_MODE: "sandbox",
      RUVON_LIVE_CHECKOUT_ENABLED: "false",
      RUVON_COMMERCE_WEBHOOK_INBOX_ENABLED: "false",
      VERCEL_ENV: "production",
    },
  },
});
