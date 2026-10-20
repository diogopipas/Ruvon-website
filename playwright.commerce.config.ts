import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/integration",
  testMatch: [
    "commerce-browser.spec.ts",
    "operations-browser.spec.ts",
    "merchant-commands-browser.spec.ts",
    "admin-financial-browser.spec.ts",
  ],
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
      RUVON_BROWSER_TEST: "true",
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
      RESEND_API_KEY: "",
      RESEND_WEBHOOK_SECRET: "",
      TWILIO_ACCOUNT_SID: "",
      TWILIO_AUTH_TOKEN: "",
      TWILIO_FROM_NUMBER: "",
      TWILIO_MESSAGING_SERVICE_SID: "",
      RUVON_SMS_ENABLED: "false",
      TWILIO_STATUS_CALLBACK_URL: "",
      CHECKLY_HEARTBEAT_URL: "",
    },
  },
});
