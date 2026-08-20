import { test, expect } from '@playwright/test';

test('home and standalone load', async ({ page }) => {
  const home = await page.goto('/');
  expect(home.ok()).toBeTruthy();
  await expect(page.locator('h1')).toContainText(/巴士|Live arrivals/);
  const stand = await page.goto('/standalone.html');
  expect(stand.ok()).toBeTruthy();
});

test('guide and user manual', async ({ page, request }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /使用說明|Guide/ }).click();
  await expect(page.locator('.guide h2')).toContainText(/使用說明|How to use/);
  const pdf = await request.get('/user-manual.pdf');
  expect(pdf.ok()).toBeTruthy();
  expect(pdf.headers()['content-type'] || '').toMatch(/pdf/);
});
