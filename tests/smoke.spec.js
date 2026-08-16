import { test, expect } from '@playwright/test';

test('home and standalone load', async ({ page }) => {
  const home = await page.goto('/');
  expect(home.ok()).toBeTruthy();
  await expect(page.locator('h1')).toContainText(/巴士|Live arrivals/);
  const stand = await page.goto('/standalone.html');
  expect(stand.ok()).toBeTruthy();
});

test('status api', async ({ request }) => {
  const res = await request.get('/api/status');
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  expect(json.routes).toBeGreaterThan(100);
});
