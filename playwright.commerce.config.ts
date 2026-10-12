import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/integration",
  testMatch: "commerce-browser.spec.ts",
  workers: 1,
  fullyParallel: false,
  timeout: 60000,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3200",
    viewport: { width: 390, height: 844 },
    ...(process.env.PLAYWRIGHT_CHANNEL
      ? { channel: process.env.PLAYWRIGHT_CHANNEL }
      : {}),
  },
  webServer: {
    command: "npm run dev -- --webpack --port 3200",
    url: "http://localhost:3200",
    timeout: 60000,
    reuseExistingServer: false,
    env: {
      RUVON_PAYMENTS_MODE: "sandbox",
      RUVON_DELIVERY_MODE: "disabled",
      RUVON_LIVE_CHECKOUT_ENABLED: "true",
      RUVON_COMMERCE_WEBHOOK_INBOX_ENABLED: "false",
      VERCEL_ENV: "preview",
      NEXT_PUBLIC_SITE_URL: "http://localhost:3200",
      // Browser routes supply explicitly synthetic responses; credentials cannot be used.
      EASYPAY_API_KEY: "",
      EASYPAY_ACCOUNT_ID: "",
      UBER_CLIENT_ID: "",
      UBER_CLIENT_SECRET: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
      RUVON_SANDBOX_SUPABASE_SERVICE_ROLE_KEY: "",
    },
  },
});
