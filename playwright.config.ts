import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/integration",
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
      JOLA_LOCAL_DEMO: "true",
      JOLA_DATA_DIR: ".data/integration",
      ADMIN_PASSWORD: "jola-integration-only",
      SUPABASE_URL: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
      NEXT_PUBLIC_SITE_URL: "http://localhost:3100",
    },
  },
});
