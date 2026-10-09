import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'html',
  timeout: 30000,
  use: {
    // Override via PLAYWRIGHT_BASE_URL for investigation runs against
    // production. Default stays at the local dev server so normal CI /
    // `npx playwright test` behaves as before.
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // Cross-browser: run explicitly via `playwright test --project=firefox`
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  // Skip the local webServer spin-up when PLAYWRIGHT_BASE_URL targets
  // an external host — production doesn't need local wrangler/vite.
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : [
        {
          // wrangler dev exits at startup when the worker's assets directory
          // (../web/dist) is missing. Only its directory is needed: these
          // tests load the UI from Vite and use the Worker for API/WebSockets.
          // Avoid a duplicate frontend build on every fresh E2E checkout.
          command: 'mkdir -p dist && cd ../worker && npx wrangler dev --port 8787',
          url: 'http://localhost:8787/health',
          reuseExistingServer: !process.env.CI,
          timeout: 30000,
        },
        {
          command: 'VITE_SERVER_URL=http://localhost:8787 npx vite --port 5173 --strictPort',
          url: 'http://localhost:5173',
          reuseExistingServer: !process.env.CI,
          timeout: 15000,
        },
      ],
})
