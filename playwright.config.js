import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60000,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  // CI starts `npm run dev` itself so smoke can run after tests. Do not spawn a
  // second Next process on :3001.
  webServer: process.env.CI ? undefined : {
    command: 'npm run dev',
    url: 'http://127.0.0.1:3001',
    reuseExistingServer: true,
    timeout: 120000
  },
  use: {
    baseURL: 'http://127.0.0.1:3001',
    ...devices['Desktop Chrome']
  }
});
