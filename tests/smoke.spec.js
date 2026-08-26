import { test, expect } from '@playwright/test';

const dirNote = (page) => page.locator('.app-header + .note');
const DIR_READY = /共 \d+ 條路線服務|Directory ready|無法載入/;

test('home and standalone load', async ({ page }) => {
  const home = await page.goto('/');
  expect(home.ok()).toBeTruthy();
  await expect(page.locator('h1')).toContainText(/巴士|Live arrivals/);
  await expect(page.locator('.playground-ui')).toHaveCount(1);
  await expect(page.locator('.pg-stripe')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /附近車站|Nearby stops/ })).toHaveCount(0);
  const stand = await page.goto('/standalone.html');
  expect(stand.ok()).toBeTruthy();
  await expect(page.locator('#nearbyFind')).toHaveCount(0);
});

test('guide and user manual', async ({ page, request }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /使用說明|Guide/ }).click();
  await expect(page.locator('.guide h2')).toContainText(/使用說明|How to use/);
  await expect(page.locator('.guide')).not.toContainText(/按「附近車站」|Nearby stops opens/);
  const pdf = await request.get('/user-manual.pdf');
  expect(pdf.ok()).toBeTruthy();
  expect(pdf.headers()['content-type'] || '').toMatch(/pdf/);
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
  await expect(page.locator('button.tab-arrivals')).toHaveClass(/active/);
  await expect(page.getByRole('heading', { name: /九巴／龍運／城巴|Live arrivals|實時到站/ }).first()).toBeVisible();
  await expect(dirNote(page)).toContainText(DIR_READY, { timeout: 45000 });
  await expect(page.locator('button.tab-arrivals')).toHaveClass(/active/);
  await expect(page.locator('button.tab-home')).not.toHaveClass(/active/);
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
  await expect(page.locator('button.tab-arrivals')).toHaveClass(/active/);
  await expect(dirNote(page)).toContainText(DIR_READY, { timeout: 45000 });
  await expect(page.locator('button.tab-arrivals')).toHaveClass(/active/);
  await expect(page.locator('button.tab-home')).not.toHaveClass(/active/);
  const panel = page.locator('.panel.active');
  await expect(panel.locator('.arrival-board')).toBeVisible({ timeout: 40000 });
  await expect(panel).toContainText(/九巴 1|KMB 1/);
  await expect(panel).toContainText(/竹園|Chuk Yuen/);
  await expect(panel).toContainText(/分鐘|min|沒有|no bus|目前找不到/i, { timeout: 40000 });
});

test('Light Rail is first and dest is termini only', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /港鐵／輕鐵|MTR \/ Light Rail/ }).click();
  const panel = page.locator('.panel.active');
  const lineSelect = panel.getByLabel(/路綫|Line/);
  await expect(lineSelect.locator('option').first()).toHaveText(/輕鐵|Light Rail/);
  await expect(lineSelect).toHaveValue('LRT');
  const destSelect = panel.getByLabel(/此程終點（可留空）|Destination on this ride/);
  const destTexts = await destSelect.locator('option').allTextContents();
  expect(destTexts.length).toBeLessThanOrEqual(9);
  expect(destTexts.some((text) => /兆康|Siu Hong/.test(text))).toBeTruthy();
  expect(destTexts.some((text) => /元朗|Yuen Long/.test(text))).toBeTruthy();
  expect(destTexts.some((text) => /市中心|Town Centre/.test(text))).toBeFalsy();
  await expect(panel).toContainText(/分鐘|min|沒有|no train|下班|Next|載入|Loading/i, { timeout: 20000 });
  const mins = panel.locator('.mins');
  const count = await mins.count();
  for (let i = 0; i < count; i += 1) {
    const text = (await mins.nth(i).innerText()).trim();
    expect(text).toMatch(/^\d+|即將|min/i);
  }
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
  await expect(dirNote(page)).toContainText(DIR_READY, { timeout: 45000 });
  await page.locator('.panel.active').getByLabel(/路線，例如|Route, for example/).fill('1');
  await page.locator('.panel.active').getByRole('button', { name: /^查詢$|^Find$/ }).click();
  await expect(page.getByRole('button', { name: /嶼巴 1|NLB 1/ }).first()).toBeVisible({ timeout: 20000 });
  await page.locator('.panel.active').getByLabel(/路線，例如|Route, for example/).fill('3M');
  await page.locator('.panel.active').getByRole('button', { name: /^查詢$|^Find$/ }).click();
  await expect(page.getByRole('button', { name: /嶼巴 3M|NLB 3M/ }).first()).toBeVisible({ timeout: 20000 });
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
  await expect(panel).toContainText(/運輸署公布走線|Transport Department official/, { timeout: 40000 });
  const stopPick = panel.getByLabel(/選擇上車站|Choose boarding stop/);
  await expect(stopPick).toBeVisible();
  const stopValue = await stopPick.evaluate((el) => {
    const opt = [...el.options].find((o) => /竹園邨總站|Chuk Yuen Estate Bus Terminus/.test(o.textContent || ''));
    return opt ? opt.value : '';
  });
  expect(stopValue).not.toBe('');
  await stopPick.selectOption(stopValue);
  await expect(panel).toContainText(/分鐘|min|沒有|no bus|目前找不到/i, { timeout: 20000 });
  await panel.getByLabel(/路線，例如|Route, for example/).fill('3M');
  await expect(panel).not.toContainText(/竹園邨總站|Chuk Yuen Estate Bus Terminus/);
  await expect(panel.locator('.stop-map')).toHaveCount(0);
  await panel.getByRole('button', { name: /^查詢$|^Find$/ }).click();
  await expect(page.getByRole('button', { name: /嶼巴 3M|NLB 3M/ }).first()).toBeVisible({ timeout: 20000 });
});

test('transfer helper and MTR tabs still search', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/');
  await expect(dirNote(page)).toContainText(DIR_READY, { timeout: 45000 });
  await page.getByRole('button', { name: /轉乘助手|Transfer helper/ }).click();
  const transfer = page.locator('.panel.active');
  await transfer.getByLabel(/第一程路線|First route/).fill('1');
  await transfer.getByRole('button', { name: /^查詢$|^Find$/ }).first().click();
  await transfer.getByRole('button', { name: /九巴 1|KMB 1/ }).filter({ hasText: /竹園|Chuk Yuen/ }).first().click();
  const board = transfer.getByLabel(/上車站／下一站|Boarding \/ next stop/, { exact: true });
  await expect.poll(async () => board.evaluate((el) => (
    [...el.options].some((o) => /竹園邨總站|Chuk Yuen Estate Bus Terminus/.test(o.textContent || ''))
  )), { timeout: 40000 }).toBe(true);
  const boardValue = await board.evaluate((el) => {
    const opt = [...el.options].find((o) => /竹園邨總站|Chuk Yuen Estate Bus Terminus/.test(o.textContent || ''));
    return opt ? opt.value : '';
  });
  await board.selectOption(boardValue);
  const inter = transfer.getByLabel(/^轉車站$|^Transfer stop$/);
  await expect.poll(async () => inter.evaluate((el) => (
    [...el.options].some((o) => /旺角豉油街|Soy Street/.test(o.textContent || ''))
  )), { timeout: 15000 }).toBe(true);
  const interValue = await inter.evaluate((el) => {
    const opt = [...el.options].find((o) => /旺角豉油街|Soy Street/.test(o.textContent || ''));
    return opt ? opt.value : '';
  });
  await inter.selectOption(interValue);
  await transfer.getByPlaceholder(/輸入站名|Type a stop name/).fill('尖沙咀碼頭');
  await transfer.getByRole('button', { name: /^查詢$|^Find$/ }).last().click();
  await transfer.getByRole('button', { name: /尖沙咀碼頭|Star Ferry/ }).first().click();
  await transfer.getByRole('button', { name: /顯示即將開出班次|Show upcoming buses/ }).click();
  await expect(transfer).toContainText(/即將開出的第一程|Upcoming first-bus/, { timeout: 40000 });
  await expect(transfer).toContainText(/分鐘|min|沒有|no bus|目前找不到/i);
  await transfer.getByRole('button', { name: /選擇這一班|Choose this bus/ }).first().click();
  await expect(transfer).toContainText(/可乘搭班次|All buses you can take/, { timeout: 40000 });
  await expect(transfer).toContainText(/分鐘|min|找不到可轉乘|no connection/i);
  await page.getByRole('button', { name: /港鐵／輕鐵|MTR \/ Light Rail/ }).click();
  await expect(page.getByRole('heading', { name: /港鐵／輕鐵|Next MTR/ }).first()).toBeVisible();
  await page.getByRole('button', { name: /顯示下班車|Show next trains/ }).click();
  await expect(page.locator('.panel.active')).toContainText(/分鐘|min|沒有|no train|下班|Next/i, { timeout: 20000 });
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
  await expect(page.locator('body')).toContainText(/運輸署|官方|official|CSDI|Transport Department|straight|直線/);
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
