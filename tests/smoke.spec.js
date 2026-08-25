import { test, expect } from '@playwright/test';

test('home and standalone load', async ({ page }) => {
  const home = await page.goto('/');
  expect(home.ok()).toBeTruthy();
  await expect(page.locator('h1')).toContainText(/巴士|Live arrivals/);
  await expect(page.locator('.playground-ui')).toHaveCount(1);
  await expect(page.locator('.pg-stripe')).toHaveCount(1);
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

test('product tabs stay available', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /巴士／小巴|Bus \/ minibus/ })).toBeVisible();
  await page.getByRole('button', { name: /轉乘助手|Transfer helper/ }).click();
  await expect(page.getByRole('heading', { name: /轉乘助手|Transfer helper/ }).first()).toBeVisible();
  await page.getByRole('button', { name: /港鐵／輕鐵|MTR \/ Light Rail/ }).click();
  await expect(page.getByRole('heading', { name: /港鐵／輕鐵|Next MTR/ }).first()).toBeVisible();
  await page.getByRole('button', { name: /我的回家路線|My travel home/ }).click();
  await expect(page.getByRole('heading', { name: /我的回家路線|My travel home/ }).first()).toBeVisible();
});

test('search lists NLB 1 and 3M', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/');
  await expect(page.locator('.note')).toContainText(/共 \d+ 條路線服務|Directory ready/, { timeout: 30000 });
  await page.locator('.panel.active').getByLabel(/路線，例如|Route, for example/).fill('1');
  await page.locator('.panel.active').getByRole('button', { name: /^查詢$|^Find$/ }).click();
  await expect(page.getByRole('button', { name: /嶼巴 1|NLB 1/ }).first()).toBeVisible({ timeout: 20000 });
  await page.locator('.panel.active').getByLabel(/路線，例如|Route, for example/).fill('3M');
  await page.locator('.panel.active').getByRole('button', { name: /^查詢$|^Find$/ }).click();
  await expect(page.getByRole('button', { name: /嶼巴 3M|NLB 3M/ }).first()).toBeVisible({ timeout: 20000 });
});

test('playground lists KMB Citybus NLB and draws a map', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/playground');
  await expect(page.locator('h1')).toContainText(/路線地圖練習場|Route map playground/);
  await expect(page.locator('.playground-ui')).toHaveCount(1);
  await expect(page.getByRole('link', { name: /返回到站|Back to arrivals/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^查詢$|^Find$/ })).toBeEnabled({ timeout: 40000 });
  await page.getByRole('button', { name: /^查詢$|^Find$/ }).click();
  await expect(page.getByRole('button', { name: /九巴 1|KMB 1/ }).first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('button', { name: /城巴 1|Citybus 1/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /嶼巴 1|NLB 1/ }).first()).toBeVisible();
  await page.getByRole('button', { name: /尖沙咀碼頭 → 竹園邨|Star Ferry → Chuk Yuen/ }).first().click();
  await expect(page.locator('.stop-map.playground-map')).toBeVisible({ timeout: 40000 });
  await expect(page.locator('body')).toContainText(/OpenStreetMap|沿道路|straight|直線/);
});

test('playground lists LWB and GMB services', async ({ page }) => {
  await page.goto('/playground');
  await expect(page.getByRole('button', { name: /^查詢$|^Find$/ })).toBeEnabled({ timeout: 40000 });
  await page.getByLabel(/路線，例如|Route, for example/).fill('A31');
  await page.getByRole('button', { name: /^查詢$|^Find$/ }).click();
  await expect(page.locator('body')).toContainText(/龍運 A31|LWB A31|九巴 A31|KMB A31/, { timeout: 15000 });
  await page.getByLabel(/路線，例如|Route, for example/).fill('811');
  await page.getByRole('button', { name: /^查詢$|^Find$/ }).click();
  await expect(page.locator('body')).toContainText(/專線小巴 811|Minibus 811/, { timeout: 20000 });
});
