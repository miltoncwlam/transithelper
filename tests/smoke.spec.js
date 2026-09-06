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
  await expect(page.getByRole('button', { name: /附近到站|Nearby arrivals/ })).toBeVisible();
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
  await expect(page.locator('.guide')).not.toContainText(/練習場|playground/i);
  await expect(page.locator('.guide')).toContainText(/附近到站|Nearby arrivals/);
  await expect(page.locator('.guide')).toContainText(/輕鐵|Light Rail/);
  await expect(page.locator('.guide')).toContainText(/趕車助手|Catch-up helper/);
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

test('MTR tab includes Light Rail and defaults to Tsuen Wan line', async ({ page }) => {
  await page.goto('/');
  await page.locator('button.tab-mtr').click();
  const panel = page.locator('.panel.active');
  await expect(page.getByRole('heading', { name: /港鐵下班車|Next MTR trains/ }).first()).toBeVisible();
  const lineSelect = panel.getByLabel(/路綫|Line/);
  await expect(lineSelect).toContainText(/荃灣|Tsuen Wan/);
  await lineSelect.click();
  await expect(page.getByRole('option', { name: /輕鐵|Light Rail/ })).toBeVisible();
  await page.getByRole('option', { name: /輕鐵|Light Rail/ }).click();
  await expect(panel).toContainText(/屯門碼頭|Tuen Mun Ferry Pier/);
  await panel.getByRole('button', { name: /顯示下班車|Show next trains/ }).click();
  await expect(panel).toContainText(/只公布本站|this stop only|沒有|no train|分鐘|min/i, { timeout: 20000 });
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

async function pickTransferStop(page, panel, label, query, option) {
  await expect(async () => {
    await panel.getByLabel(label).fill(query);
    await panel.getByLabel(label).locator('xpath=ancestor::*[contains(@class,"search-row")][1]').getByRole('button', { name: /^查詢$|^Find$/ }).click();
    await expect(page.getByRole('option', { name: option }).first()).toBeVisible({ timeout: 4000 });
  }).toPass({ timeout: 30000 });
  await page.getByRole('option', { name: option }).first().click();
}

function mockJourneyOptions({ preferred = false, etaMinutes = 4 } = {}) {
  const eta = new Date(Date.now() + etaMinutes * 60000).toISOString();
  const etaLater = new Date(Date.now() + (etaMinutes + 12) * 60000).toISOString();
  const arriveFast = new Date(Date.now() + 22 * 60000).toISOString();
  const etaSlow = new Date(Date.now() + 18 * 60000).toISOString();
  const etaSlowLater = new Date(Date.now() + 26 * 60000).toISOString();
  const arriveSlow = new Date(Date.now() + 40 * 60000).toISOString();
  const connect = new Date(Date.now() + 28 * 60000).toISOString();
  const arriveXfer = new Date(Date.now() + 36 * 60000).toISOString();
  return {
    observedOnly: true,
    preferredMissing: false,
    emptyReason: null,
    options: [
      {
        kind: 'direct',
        recommended: true,
        preferred: false,
        slowerByMinutes: null,
        first: { route: '1', co: 'KMB', bound: 'O', service_type: '1', dest_tc: '尖沙咀碼頭', dest_en: 'Star Ferry' },
        second: null,
        boardStops: ['A1'],
        interchangeStops: ['C1'],
        destinationStops: ['C1'],
        eta,
        arrive: arriveFast,
        arrivalEstimated: true,
        rideMinutes: 18,
        walkMinutes: 0,
        totalMinutes: 18,
        dest: { zh: '尖沙咀碼頭', en: 'Star Ferry' },
        from: { zh: '竹園邨總站', en: 'Chuk Yuen Estate Bus Terminus' },
        to: { zh: '尖沙咀碼頭', en: 'Star Ferry' },
        catchable: true
      },
      {
        kind: 'direct',
        recommended: false,
        preferred: false,
        slowerByMinutes: 12,
        first: { route: '1', co: 'KMB', bound: 'O', service_type: '1', dest_tc: '尖沙咀碼頭', dest_en: 'Star Ferry' },
        second: null,
        boardStops: ['A1'],
        interchangeStops: ['C1'],
        destinationStops: ['C1'],
        eta: etaLater,
        arrive: arriveFast,
        arrivalEstimated: true,
        rideMinutes: 18,
        walkMinutes: 0,
        totalMinutes: 18,
        dest: { zh: '尖沙咀碼頭', en: 'Star Ferry' },
        from: { zh: '竹園邨總站', en: 'Chuk Yuen Estate Bus Terminus' },
        to: { zh: '尖沙咀碼頭', en: 'Star Ferry' },
        catchable: true
      },
      {
        kind: 'transfer',
        recommended: false,
        preferred,
        slowerByMinutes: 14,
        first: { route: '9', co: 'KMB', bound: 'O', service_type: '1', dest_tc: '旺角', dest_en: 'Mong Kok' },
        second: { route: '2', co: 'KMB', bound: 'O', service_type: '1', dest_tc: '尖沙咀碼頭', dest_en: 'Star Ferry' },
        boardStops: ['A1'],
        interchangeStops: ['B1'],
        destinationStops: ['C1'],
        eta: etaSlow,
        connectionEta: connect,
        arrive: arriveSlow,
        arrivalEstimated: true,
        rideMinutes: 22,
        walkMinutes: 2,
        totalMinutes: 22,
        dest: { zh: '尖沙咀碼頭', en: 'Star Ferry' },
        from: { zh: '旺角', en: 'Mong Kok' },
        to: { zh: '尖沙咀碼頭', en: 'Star Ferry' },
        catchable: true
      },
      {
        kind: 'transfer',
        recommended: false,
        preferred: false,
        slowerByMinutes: 14,
        first: { route: '9', co: 'KMB', bound: 'O', service_type: '2', dest_tc: '旺角', dest_en: 'Mong Kok' },
        second: { route: '2', co: 'KMB', bound: 'O', service_type: '1', dest_tc: '尖沙咀碼頭', dest_en: 'Star Ferry' },
        boardStops: ['A1'],
        interchangeStops: ['B1'],
        destinationStops: ['C1'],
        eta: etaSlowLater,
        connectionEta: connect,
        arrive: arriveSlow,
        arrivalEstimated: true,
        rideMinutes: 22,
        walkMinutes: 2,
        totalMinutes: 22,
        dest: { zh: '尖沙咀碼頭', en: 'Star Ferry' },
        from: { zh: '旺角', en: 'Mong Kok' },
        to: { zh: '尖沙咀碼頭', en: 'Star Ferry' },
        catchable: true
      },
      {
        kind: 'transfer',
        recommended: false,
        preferred: false,
        slowerByMinutes: 14,
        first: { route: '1', co: 'KMB', bound: 'O', service_type: '1' },
        second: { route: '203E', co: 'KMB', bound: 'O', service_type: '1' },
        boardStops: ['A1'],
        interchangeStops: ['B1'],
        destinationStops: ['C1'],
        eta,
        connectionEta: connect,
        arrive: arriveXfer,
        arrivalEstimated: true,
        rideMinutes: 24,
        walkMinutes: 3,
        totalMinutes: 32,
        dest: { zh: '尖沙咀碼頭', en: 'Star Ferry' },
        from: { zh: '旺角', en: 'Mong Kok' },
        to: { zh: '尖沙咀碼頭', en: 'Star Ferry' },
        catchable: true
      }
    ]
  };
}

test('transfer helper requires origin and destination only', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/');
  await expect(dirNote(page)).toContainText(DIR_READY, { timeout: 45000 });
  await page.getByRole('tab', { name: /轉乘助手|Transfer helper/ }).click();
  const transfer = page.locator('.panel.active');
  await expect(transfer.getByLabel(/指定第一程|Preferred first route/)).toBeVisible();
  await expect(transfer.getByRole('combobox', { name: /上車站／下一站|Boarding \/ next stop/ })).toHaveCount(0);
  await transfer.getByRole('button', { name: /找出較快班次|Find faster trips/ }).click();
  await expect(transfer).toContainText(/請選擇起點和終點|Choose a starting stop and a destination/);
});

test('transfer helper finds options without a route and locks the chosen trip', async ({ page }) => {
  test.setTimeout(120000);
  const posted = [];
  await page.route('**/api/journey-options', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const body = route.request().postDataJSON() || {};
    posted.push(body);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockJourneyOptions({ preferred: !!body.preferredFirst }))
    });
  });
  const transferPosts = [];
  await page.route('**/api/transfer', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const body = route.request().postDataJSON() || {};
    transferPosts.push(body);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        phase: 'connections',
        firstArrivalAtInterchange: body.selectedDeparture || new Date(Date.now() + 20 * 60000).toISOString(),
        boardDeparture: body.selectedDeparture || new Date(Date.now() + 4 * 60000).toISOString(),
        arrivalEstimated: true,
        leftBoard: false,
        firstStops: [{ name_tc: '竹園邨總站', name_en: 'Chuk Yuen', eta: body.selectedDeparture }],
        list: [],
        watch: body.selectedConnection ? { selected: { ...body.selectedConnection, eta: body.selectedConnection.eta }, catchable: true } : null,
        emptyReason: null
      })
    });
  });
  await page.route('**/api/search-live**', async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('route') !== '9') return route.continue();
    const service = {
      route: '9',
      co: 'KMB',
      bound: 'O',
      service_type: '1',
      orig_tc: '彩福',
      dest_tc: '尖沙咀東',
      orig_en: 'Choi Fook',
      dest_en: 'Tsim Sha Tsui East'
    };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        keep: [{ service, live: [{ eta: new Date(Date.now() + 60000).toISOString() }] }],
        auto: service
      })
    });
  });
  await page.route('**/api/kmb/route-stop/**', async (route) => {
    if (!route.request().url().includes('/route-stop/9/')) return route.continue();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          { stop: 'A1', name_tc: '彩福', name_en: 'Choi Fook', lat: 22.32, long: 114.21, co: 'KMB' },
          { stop: 'B1', name_tc: '旺角豉油街', name_en: 'Soy Street Mong Kok', lat: 22.32, long: 114.17, co: 'KMB' },
          { stop: 'C1', name_tc: '尖沙咀東', name_en: 'Tsim Sha Tsui East', lat: 22.3, long: 114.18, co: 'KMB' }
        ]
      })
    });
  });
  await page.route('**/api/fares**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ fare: null }) });
  });
  await page.goto('/');
  await expect(dirNote(page)).toContainText(DIR_READY, { timeout: 45000 });
  await page.getByRole('tab', { name: /轉乘助手|Transfer helper/ }).click();
  const transfer = page.locator('.panel.active');
  await pickTransferStop(page, transfer, /起點／上車站|Start \/ boarding stop/, '竹園邨總站', /竹園邨總站|Chuk Yuen Estate Bus Terminus/);
  await pickTransferStop(page, transfer, /^終點$|^Destination$/, '尖沙咀碼頭', /尖沙咀碼頭|Star Ferry/);
  await transfer.getByRole('button', { name: /找出較快班次|Find faster trips/ }).click();
  await expect(transfer).toContainText(/目前觀察到較快的選擇|Fastest among currently observed/, { timeout: 20000 });
  await expect(transfer).toContainText(/最快：1|Fastest: 1/);
  await expect(transfer.getByRole('button', { name: /就乘這一程|Take this trip/ })).toBeVisible();
  await expect(transfer).toContainText(/估計|est\./);
  await expect(transfer).toContainText(/9 轉 2|9 then 2/);
  await expect(transfer).toContainText(/其後|then /);
  await expect(transfer.getByText(/選擇這一程|Choose this trip/)).toHaveCount(0);
  await expect(transfer.getByRole('button', { name: /9 轉 2|9 then 2/ })).toHaveCount(1);
  await expect(transfer).toContainText(/只比較現正有實時班次|Only routes with live departures/);
  await page.getByRole('button', { name: 'English' }).click();
  await expect(transfer).toContainText('9 then 2');
  await expect(transfer).not.toContainText(/9 to 2/);
  await page.getByRole('button', { name: '中文' }).click();
  expect(posted[0]?.preferredFirst).toBeFalsy();
  expect(posted[0]?.originStops?.length).toBeGreaterThan(0);
  expect(posted[0]?.destinationStops?.length).toBeGreaterThan(0);

  const routeInput = transfer.getByPlaceholder(/路線，例如|Route, for example/);
  await routeInput.fill('9');
  await routeInput.locator('xpath=ancestor::*[contains(@class,"search-row")][1]').getByRole('button', { name: /^查詢$|^Find$/ }).click();
  const routeChoice = transfer.getByRole('button', { name: /九巴 9|KMB 9/ }).first();
  if (await routeChoice.isVisible().catch(() => false)) await routeChoice.click();
  await expect(transfer.getByRole('combobox', { name: /指定轉車站|Preferred transfer stop/ })).toBeVisible({ timeout: 40000 });
  await transfer.getByRole('button', { name: /找出較快班次|Find faster trips/ }).click();
  await expect(transfer).toContainText(/你指定的路線約慢|Your preferred route is about/, { timeout: 20000 });
  expect(posted.at(-1)?.preferredFirst?.route).toBe('9');

  await transfer.getByRole('button', { name: /9 轉 2|9 then 2/ }).click();
  await expect(transfer).toContainText(/正在留意這一班第一程|Watching this first bus|實時追蹤|Live/, { timeout: 20000 });
  expect(transferPosts[0]?.selectedDeparture).toBeTruthy();
  expect(transferPosts[0]?.first?.route).toBe('9');
  expect(transferPosts[0]?.phase).toBe('connections');
});

test('transfer helper empty feed and preferred-missing banner', async ({ page }) => {
  test.setTimeout(90000);
  await page.route('**/api/journey-options', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const body = route.request().postDataJSON() || {};
    if (body.preferredFirst) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...mockJourneyOptions({ preferred: false }),
          preferredMissing: true
        })
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ options: [], emptyReason: 'no_departure', observedOnly: true, preferredMissing: false })
    });
  });
  await page.goto('/');
  await expect(dirNote(page)).toContainText(DIR_READY, { timeout: 45000 });
  await page.getByRole('tab', { name: /轉乘助手|Transfer helper/ }).click();
  const transfer = page.locator('.panel.active');
  await pickTransferStop(page, transfer, /起點／上車站|Start \/ boarding stop/, '竹園邨總站', /竹園邨總站|Chuk Yuen Estate Bus Terminus/);
  await pickTransferStop(page, transfer, /^終點$|^Destination$/, '尖沙咀碼頭', /尖沙咀碼頭|Star Ferry/);
  await transfer.getByRole('button', { name: /找出較快班次|Find faster trips/ }).click();
  await expect(transfer).toContainText(/目前找不到第一程巴士在上車站的開出時間|No first-bus departure was found at the boarding stop/, { timeout: 20000 });

  await page.route('**/api/search-live**', async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('route') !== '9') return route.continue();
    const service = {
      route: '9',
      co: 'KMB',
      bound: 'O',
      service_type: '1',
      orig_tc: '彩福',
      dest_tc: '尖沙咀東',
      orig_en: 'Choi Fook',
      dest_en: 'Tsim Sha Tsui East'
    };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ keep: [{ service, live: [{ eta: new Date(Date.now() + 60000).toISOString() }] }], auto: service })
    });
  });
  await page.route('**/api/kmb/route-stop/**', async (route) => {
    if (!route.request().url().includes('/route-stop/9/')) return route.continue();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          { stop: 'A1', name_tc: '彩福', name_en: 'Choi Fook', lat: 22.32, long: 114.21, co: 'KMB' },
          { stop: 'B1', name_tc: '旺角豉油街', name_en: 'Soy Street Mong Kok', lat: 22.32, long: 114.17, co: 'KMB' }
        ]
      })
    });
  });
  const routeInput = transfer.getByPlaceholder(/路線，例如|Route, for example/);
  await routeInput.fill('9');
  await routeInput.locator('xpath=ancestor::*[contains(@class,"search-row")][1]').getByRole('button', { name: /^查詢$|^Find$/ }).click();
  const routeChoice = transfer.getByRole('button', { name: /九巴 9|KMB 9/ }).first();
  if (await routeChoice.isVisible().catch(() => false)) await routeChoice.click();
  await transfer.getByRole('button', { name: /找出較快班次|Find faster trips/ }).click();
  await expect(transfer).toContainText(/指定路線現時沒有實時開出|Your preferred route has no live departure now/, { timeout: 20000 });
});

test('transfer helper and MTR tabs still search', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/');
  await expect(dirNote(page)).toContainText(DIR_READY, { timeout: 45000 });
  await page.getByRole('tab', { name: /轉乘助手|Transfer helper/ }).click();
  const transfer = page.locator('.panel.active');
  await pickTransferStop(page, transfer, /起點／上車站|Start \/ boarding stop/, '竹園邨總站', /竹園邨總站|Chuk Yuen Estate Bus Terminus/);
  await pickTransferStop(page, transfer, /^終點$|^Destination$/, '尖沙咀碼頭', /尖沙咀碼頭|Star Ferry/);
  await transfer.getByRole('button', { name: /找出較快班次|Find faster trips/ }).click();
  await expect(transfer).toContainText(/目前觀察到|Fastest among|目前找不到由起點|No live bus or minibus|分鐘|min|估計|est/i, { timeout: 45000 });
  await page.locator('button.tab-mtr').click();
  await expect(page.getByRole('heading', { name: /港鐵下班車|Next MTR trains/ }).first()).toBeVisible();
  await page.getByRole('button', { name: /顯示下班車|Show next trains/ }).click();
  await expect(page.locator('.panel.active')).toContainText(/分鐘|min|沒有|no train|下班|Next/i, { timeout: 20000 });
});

test('playground route is gone', async ({ page }) => {
  const res = await page.goto('/playground');
  expect(res?.status()).toBe(404);
});

test('catch-up helper follows the locked trip and shows miss-cost', async ({ page }) => {
  test.setTimeout(120000);
  const posted = [];
  await page.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = (ok) => {
      ok({ coords: { latitude: 22.3, longitude: 114.17, accuracy: 20 } });
    };
  });
  await page.route('**/api/journey-options', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockJourneyOptions({ etaMinutes: 1 }))
    });
  });
  await page.route('**/api/catch-up', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    posted.push(route.request().postDataJSON() || {});
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        catch: {
          stop: 'C',
          name: { zh: '太和邨', en: 'Tai Wo Estate' },
          seqIndex: 2,
          walkMinutes: 4,
          busMinutes: 6,
          busEta: new Date(Date.now() + 6 * 60000).toISOString(),
          estimated: false
        },
        backup: null,
        missSame: { eta: new Date(Date.now() + 12 * 60000).toISOString(), waitMinutes: 12 },
        missAlt: { route: '85X', kind: 'direct', waitMinutes: 4, eta: new Date(Date.now() + 4 * 60000).toISOString() },
        emptyReason: null
      })
    });
  });
  await page.goto('/');
  await expect(dirNote(page)).toContainText(DIR_READY, { timeout: 45000 });
  await page.getByRole('tab', { name: /轉乘助手|Transfer helper/ }).click();
  const transfer = page.locator('.panel.active');
  await pickTransferStop(page, transfer, /起點／上車站|Start \/ boarding stop/, '竹園邨總站', /竹園邨總站|Chuk Yuen Estate Bus Terminus/);
  await pickTransferStop(page, transfer, /^終點$|^Destination$/, '尖沙咀碼頭', /尖沙咀碼頭|Star Ferry/);
  await transfer.getByRole('button', { name: /找出較快班次|Find faster trips/ }).click();
  await expect(transfer).toContainText(/下一班同一路線約|Next of the same route/, { timeout: 20000 });
  await transfer.getByRole('button', { name: /就乘這一程|Take this trip/ }).click();
  await expect(transfer.getByRole('button', { name: /趕這一班|Catch this bus/ })).toBeVisible();
  await transfer.getByRole('button', { name: /趕這一班|Catch this bus/ }).click();
  await expect(transfer.locator('.catch-up-card')).toContainText(/趕車助手|Catch-up helper/);
  await expect(transfer.locator('.catch-up-card')).toContainText(/太和邨|Tai Wo Estate/);
  await expect(transfer.locator('.catch-up-card')).toContainText(/估計|est/);
  await expect(transfer.locator('.catch-up-card')).toContainText(/實時|live/);
  await expect(transfer.locator('.catch-up-card')).toContainText(/錯過代價|If you miss it/);
  await expect(transfer.locator('.catch-up-card')).toContainText(/下一班同一路線約 12|Next of the same route in about 12/);
  await expect(transfer.locator('.catch-up-card')).toContainText(/85X/);
  expect(posted[0]?.first?.route).toBe('1');
  expect(posted[0]?.laterEtas?.length).toBeGreaterThan(0);
});
