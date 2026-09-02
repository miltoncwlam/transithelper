import { test, expect } from '@playwright/test';

const dirNote = (page) => page.locator('.app-header + .note');
const DIR_READY = /共 \d+ 條路線服務|Directory ready|無法載入/;

async function pickComboboxOption(page, combobox, text) {
  await combobox.click();
  await page.getByRole('option', { name: text }).first().click();
}

test('home and standalone load', async ({ page }) => {
  const home = await page.goto('/');
  expect(home.ok()).toBeTruthy();
  await expect(page.locator('h1')).toContainText(/巴士|Live arrivals/);
  await expect(page.locator('.app-shell')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /附近車站|Nearby stops/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /路線地圖|Route map/ })).toHaveCount(0);
  const stand = await page.goto('/standalone.html');
  expect(stand.ok()).toBeTruthy();
  await expect(page.locator('#nearbyFind')).toHaveCount(0);
});

test('guide and user manual', async ({ page, request }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /使用說明|Guide/ }).click();
  await expect(page.locator('.guide h2')).toContainText(/使用說明|How to use/);
  await expect(page.locator('.guide')).not.toContainText(/按「附近車站」|Nearby stops opens|輕鐵|Light Rail|練習場|playground/i);
  const pdf = await request.get('/user-manual.pdf');
  expect(pdf.ok()).toBeTruthy();
  expect(pdf.headers()['content-type'] || '').toMatch(/pdf/);
  const body = await pdf.body();
  expect(body.length).toBeGreaterThan(1000);
});

test('saved homes do not steal the arrivals tab', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('tb-homes', JSON.stringify([{
      id: 'local-test',
      type: 'arrival',
      title: { zh: '測試回家', en: 'Test home' },
      subtitle: { zh: '測試', en: 'Test' },
      payload: { route: '1' },
      pinned: false,
      createdAt: new Date().toISOString()
    }]));
  });
  await page.goto('/');
  await expect(page.locator('button.tab-arrivals')).toHaveAttribute('data-state', 'active');
  await expect(page.getByRole('heading', { name: /九巴／龍運／城巴|Live arrivals|實時到站/ }).first()).toBeVisible();
  await expect(dirNote(page)).toContainText(DIR_READY, { timeout: 45000 });
  await expect(page.locator('button.tab-arrivals')).toHaveAttribute('data-state', 'active');
  await expect(page.locator('button.tab-home')).toHaveAttribute('data-state', 'inactive');
});

test('last bus restores on first open without stealing the tab', async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(() => {
    localStorage.setItem('tb-arrival', JSON.stringify({
      route: '1',
      service: {
        route: '1',
        co: 'KMB',
        bound: 'O',
        service_type: '1',
        orig_tc: '竹園邨',
        dest_tc: '尖沙咀碼頭',
        orig_en: 'Chuk Yuen',
        dest_en: 'Star Ferry'
      },
      stopIndex: 0,
      destIndex: ''
    }));
  });
  await page.goto('/');
  await expect(page.locator('button.tab-arrivals')).toHaveAttribute('data-state', 'active');
  await expect(dirNote(page)).toContainText(DIR_READY, { timeout: 45000 });
  await expect(page.locator('button.tab-arrivals')).toHaveAttribute('data-state', 'active');
  await expect(page.locator('button.tab-home')).toHaveAttribute('data-state', 'inactive');
  const panel = page.locator('.panel.active');
  await expect(panel.locator('.arrival-board')).toBeVisible({ timeout: 40000 });
  await expect(panel).toContainText(/九巴 1|KMB 1/);
  await expect(panel).toContainText(/竹園|Chuk Yuen/);
  await expect(panel).toContainText(/分鐘|min|沒有|no bus|目前找不到/i, { timeout: 40000 });
});

test('MTR tab has no Light Rail and defaults to Tsuen Wan line', async ({ page }) => {
  await page.goto('/');
  await page.locator('button.tab-mtr').click();
  const panel = page.locator('.panel.active');
  await expect(page.getByRole('heading', { name: /港鐵下班車|Next MTR trains/ }).first()).toBeVisible();
  await expect(panel).not.toContainText(/輕鐵|Light Rail/);
  const lineSelect = panel.getByLabel(/路綫|Line/);
  await expect(lineSelect).toContainText(/荃灣|Tsuen Wan/);
  await expect(panel).toContainText(/分鐘|min|沒有|no train|下班|Next|載入|Loading/i, { timeout: 20000 });
});

test('product tabs stay available', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('tab', { name: /巴士／小巴|Bus \/ minibus/ })).toBeVisible();
  await page.getByRole('tab', { name: /轉乘助手|Transfer helper/ }).click();
  await expect(page.getByRole('heading', { name: /轉乘助手|Transfer helper/ }).first()).toBeVisible();
  await page.locator('button.tab-mtr').click();
  await expect(page.getByRole('heading', { name: /港鐵下班車|Next MTR trains/ }).first()).toBeVisible();
  await page.getByRole('tab', { name: /我的回家路線|My travel home/ }).click();
  await expect(page.getByRole('heading', { name: /我的回家路線|My travel home/ }).first()).toBeVisible();
});

test('typing a route does not search until 查詢', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto('/');
  await expect(dirNote(page)).toContainText(DIR_READY, { timeout: 45000 });
  const panel = page.locator('.panel.active');
  await panel.getByLabel(/路線，例如|Route, for example/).fill('1');
  await expect(page.getByRole('button', { name: /九巴 1|KMB 1/ })).toHaveCount(0);
  await panel.getByRole('button', { name: /^查詢$|^Find$/ }).click();
  await expect(page.getByRole('button', { name: /九巴 1|KMB 1/ }).first()).toBeVisible({ timeout: 20000 });
});

test('search lists KMB 673 both bounds and does not timeout', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/');
  await expect(dirNote(page)).toContainText(DIR_READY, { timeout: 45000 });
  const panel = page.locator('.panel.active');
  await panel.getByLabel(/路線，例如|Route, for example/).fill('673');
  await panel.getByRole('button', { name: /^查詢$|^Find$/ }).click();
  await expect(panel).not.toContainText(/查詢逾時|The search timed out/);
  await expect(page.getByRole('button', { name: /九巴 673|KMB 673/ }).filter({ hasText: /上水|Sheung Shui/ }).first()).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('button', { name: /九巴 673|KMB 673/ })).toHaveCount(2);
  await expect(panel).toContainText(/中環|Central/);
});

test('search still lists 673 when live lookup fails', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/');
  await expect(dirNote(page)).toContainText(DIR_READY, { timeout: 45000 });
  await page.route('**/api/search-live**', (route) => route.abort());
  const panel = page.locator('.panel.active');
  await panel.getByLabel(/路線，例如|Route, for example/).fill('673');
  await panel.getByRole('button', { name: /^查詢$|^Find$/ }).click();
  await expect(panel).not.toContainText(/查詢逾時|The search timed out/);
  await expect(page.getByRole('button', { name: /九巴 673|KMB 673/ }).first()).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('button', { name: /九巴 673|KMB 673/ })).toHaveCount(2);
  await expect(panel).toContainText(/上水|Sheung Shui/);
  await expect(panel).toContainText(/中環|Central/);
});

test('search lists GMB 811', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/');
  await expect(dirNote(page)).toContainText(DIR_READY, { timeout: 45000 });
  const panel = page.locator('.panel.active');
  await panel.getByLabel(/路線，例如|Route, for example/).fill('811');
  await panel.getByRole('button', { name: /^查詢$|^Find$/ }).click();
  await expect(panel).not.toContainText(/查詢逾時|The search timed out|沒有此路線|No matching route/);
  await expect(page.getByRole('button', { name: /專線小巴.*811|GMB.*811/ }).first()).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: /專線小巴.*811|GMB.*811/ }).first().click();
  await expect(panel.getByRole('combobox', { name: /選擇上車站|Choose boarding stop/ })).toBeVisible({ timeout: 40000 });
});

test('search lists NLB 1 and 3M', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/');
  await expect(dirNote(page)).toContainText(DIR_READY, { timeout: 45000 });
  await page.locator('.panel.active').getByLabel(/路線，例如|Route, for example/).fill('1');
  await page.locator('.panel.active').getByRole('button', { name: /^查詢$|^Find$/ }).click();
  await expect(page.getByRole('button', { name: /九巴 1|KMB 1/ }).first()).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: /沒有實時班次|No live trips/ }).first().click();
  await expect(page.getByRole('button', { name: /嶼巴 1|NLB 1/ }).first()).toBeVisible({ timeout: 10000 });
  await page.locator('.panel.active').getByLabel(/路線，例如|Route, for example/).fill('3M');
  await page.locator('.panel.active').getByRole('button', { name: /^查詢$|^Find$/ }).click();
  await expect(page.locator('.panel.active')).toContainText(/3M/, { timeout: 20000 });
  const idle3m = page.getByRole('button', { name: /沒有實時班次|No live trips/ });
  if (await idle3m.count()) await idle3m.first().click();
  await expect(page.locator('.panel.active')).toContainText(/嶼巴 3M|NLB 3M|九巴 3M|KMB 3M/);
});

test('picking a route draws the official line then hides it on a new search', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/');
  await expect(dirNote(page)).toContainText(DIR_READY, { timeout: 45000 });
  const panel = page.locator('.panel.active');
  await panel.getByLabel(/路線，例如|Route, for example/).fill('1');
  await panel.getByRole('button', { name: /^查詢$|^Find$/ }).click();
  await page.getByRole('button', { name: /九巴 1|KMB 1/ }).filter({ hasText: /竹園|Chuk Yuen/ }).first().click();
  await expect(panel.locator('.stop-map')).toBeVisible({ timeout: 40000 });
  await expect(panel).toContainText(/運輸署公布走線|Transport Department official|未找到官方走線|No official line found/, { timeout: 40000 });
  const stopPick = panel.getByRole('combobox', { name: /選擇上車站|Choose boarding stop/ });
  await expect(stopPick).toBeVisible();
  await pickComboboxOption(page, stopPick, /竹園邨總站|Chuk Yuen Estate Bus Terminus/);
  await expect(panel).toContainText(/分鐘|min|沒有|no bus|目前找不到/i, { timeout: 20000 });
  await panel.getByLabel(/路線，例如|Route, for example/).fill('3M');
  await panel.getByRole('button', { name: /^查詢$|^Find$/ }).click();
  await expect(panel).not.toContainText(/竹園邨總站|Chuk Yuen Estate Bus Terminus/);
  await expect(panel.locator('.stop-map')).toHaveCount(0);
  await expect(page.locator('.panel.active')).toContainText(/3M/, { timeout: 20000 });
});

test('transfer helper and MTR tabs still search', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/');
  await expect(dirNote(page)).toContainText(DIR_READY, { timeout: 45000 });
  await page.getByRole('tab', { name: /轉乘助手|Transfer helper/ }).click();
  const transfer = page.locator('.panel.active');
  await transfer.getByLabel(/第一程路線|First route/).fill('1');
  await transfer.getByRole('button', { name: /^查詢$|^Find$/ }).first().click();
  await transfer.getByRole('button', { name: /九巴 1|KMB 1/ }).filter({ hasText: /竹園|Chuk Yuen/ }).first().click();
  const board = transfer.getByRole('combobox', { name: /上車站／下一站|Boarding \/ next stop/ });
  await expect(board).toBeVisible({ timeout: 40000 });
  await pickComboboxOption(page, board, /竹園邨總站|Chuk Yuen Estate Bus Terminus/);
  const inter = transfer.getByRole('combobox', { name: /^轉車站$|^Transfer stop$/ });
  await pickComboboxOption(page, inter, /旺角豉油街|Soy Street/);
  await transfer.getByPlaceholder(/輸入站名|Type a stop name/).fill('尖沙咀碼頭');
  await transfer.getByRole('button', { name: /^查詢$|^Find$/ }).last().click();
  await page.getByRole('option', { name: /尖沙咀碼頭|Star Ferry/ }).first().click();
  await transfer.getByRole('button', { name: /顯示即將開出班次|Show upcoming buses/ }).click();
  await expect(transfer).toContainText(/即將開出的第一程|Upcoming first-bus/, { timeout: 40000 });
  await expect(transfer).toContainText(/分鐘|min|沒有|no bus|目前找不到/i);
  await transfer.getByRole('button', { name: /選擇這一班|Choose this bus/ }).first().click();
  await expect(transfer).toContainText(/可乘搭班次|All buses you can take/, { timeout: 40000 });
  await expect(transfer).toContainText(/分鐘|min|找不到可轉乘|no connection/i);
  await page.locator('button.tab-mtr').click();
  await expect(page.getByRole('heading', { name: /港鐵下班車|Next MTR trains/ }).first()).toBeVisible();
  await page.getByRole('button', { name: /顯示下班車|Show next trains/ }).click();
  await expect(page.locator('.panel.active')).toContainText(/分鐘|min|沒有|no train|下班|Next/i, { timeout: 20000 });
});

test('playground route is gone', async ({ page }) => {
  const res = await page.goto('/playground');
  expect(res?.status()).toBe(404);
});
