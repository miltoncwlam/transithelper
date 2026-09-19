# Changelog

Every user-visible change from the original HTML paste through today. Versions are always **x.y.z**.

- **x** — new product (or a breaking removal of a whole mode)
- **y** — feature the user can see
- **z** — fix, deploy, copy, CI

Repo: [miltoncwlam/transithelper](https://github.com/miltoncwlam/transithelper). Checkout: `git checkout v2.4.0`. Current: **3.6.1**.

The long TransitBuddy chat had **272 user messages**. System pings (“restart dev server”, “inform the user”) are not versions. Every real request that landed in code is below, including work that was later squashed into one git commit.

---

## 3.6.1 — 2026-09-19

### Fixed
- **置富第一城 → 太子站** (Fortune City One → Prince Edward Station) could come back empty on a timeout even when **281A** was live at 第一城總站, 150m away. Nearby pole ETAs were one all-or-nothing fetch: if that batch missed the budget, the seed clocks were thrown away and the KMB route graph was often still cold on Vercel, so 281A was never refined. The planner now waits for the KMB graph before searching, keeps the seed-stop clocks if nearby poles are slow, and fetches the boarding-stop ETA when a graph direct (or transfer) has no clock yet. Empty operator feed still stays empty.
- A Prince Edward dest pole such as 旺角警署 now matches 281A’s 旺角花墟 stop within 280m even when the names differ.

### Tests
- Unit: Fortune City One → Prince Edward still returns live **281A** when nearby ETA fetches hang, three times in a row; seed origin clocks are kept if extra poles hang.

---

## 3.6.0 — 2026-09-19

### Changed
- **路線規劃** no longer shows only the next live clock of a route. Operator ETAs at that pole (up to four: the next bus plus three later) become trips you can pick. Same itinerary stays one card; **稍後班次** expands the later clocks. **就乘這一程** on a later row locks that clock, not the first bus. Other routes keep their slots — later 1s do not push 20–26 off the list. Empty operator feed stays empty; no timetable fill.
- **其他選擇** cards have the same expander, not only 最快.

### Tests
- Unit: two live clocks on route **1** become two members; packing keeps later 1s without dropping another route; a later first-bus on **1→2** still gets a real connection clock.
- Playwright: mocked planner feed with two clocks on **1** → 稍後班次 → expand → later 就乘這一程 locks that eta.

---

## 3.5.3 — 2026-09-17

### Fixed
- GitHub Actions still failed after 3.5.2: Playwright listed **811**, then `npm run smoke` saw empty GMB because etagmb answers live only in memory. A Next compile/reload (or hydrate hammering `/route`) dropped that cache, so `/api/gmb/lookup?route=811` and search-live came back empty, and `/api/kmb/routes` had no GMB at all.
- GMB HTTP responses (route list and route details) are now kept in a temp file as well as memory. A successful 811 lookup is merged into the directory (hydrate no longer wipes GMB rows that already have a route id). etagmb fetches retry twice. Smoke waits longer on 811 / 11.

---

## 3.5.2 — 2026-09-17

### Fixed
- Searching **811** (專線小巴, not 九巴) could return empty on a cold start: the KMB directory is “ready” first, GMB stubs have no route id, hydrate only covers the first 120 jobs (港島 / 九龍, not 新界 811), and `/api/search-live` dropped the etagmb lookup when its 6.5s budget was already spent. A GMB-only search now waits for that lookup (up to 12s) before saying there is no route.
- GitHub Actions warms `/api/gmb/lookup?route=811` after the KMB directory, and Playwright waits for that lookup before tapping 查詢. The button match includes 專線小巴 / Minibus / GMB.

---

## 3.5.1 — 2026-09-17

### Changed
- The from/to tab is **路線規劃** / **Route planner**, not 轉乘助手 / Transfer helper / Transfer Buddy. Tab, heading, document title, PWA short name, Apple web-app title, in-app 使用說明, user manual, and the saved-route type badge all use the new name. Historical changelog, `00-required/`, and v1.0 HTML keep the old wording.

---

## 3.5.0 — 2026-09-17

### Changed
- **轉乘助手** is from / to / search, like a map. Nearby radius, preferred first route, and transfer-stop pickers are off the main sheet (nearby poles are still included). Typing a stop name lists matches; picking both ends also searches.
- Results rank by four things together: travel time, transfer (hassle plus interchange wait already in the clock), walking (shown on the card, and heavier than sitting on the bus), and Octopus fare at the statutory minimum wage. A transfer that is only a minute faster — especially a dearer one like 1→7 at $12.3 vs staying on 1 at $6.7 — is not 最快. Clocks stay honest; 較抵 labels stay off. Miss-cost is not shown on the list; lock a trip, then **錯過了**.
- **出門規劃** is a closed control under the results, not in the middle of the form.

### Tests
- Unit: same-fare 1-minute transfer loses; 1→7 at $12.3 loses to 1 at $6.7; dest walk is heavier than sitting; cheaper 2-minute-slower direct still wins at SMW.
- Playwright: from/to only; 搜尋; 最快; 9 → 2 lock; empty feed stays empty.

---

## 3.4.0 — 2026-09-12

### Changed
- Locking a departure **is** 趕車. **就乘這一程** locks that clock. **錯過了** is the button if you miss it: the next live trip of the same route at this pole, and a faster live option when a destination is set (Arrivals dest, or Transfer Buddy’s compare list).
- The old 趕車助手 walk — “步行約 9 分鐘到青華苑，此班約 9 分鐘到” — is gone. The app does not send you to the next stop to chase this bus. An empty feed stays empty. The next bus is never labelled as catching this trip.

### Tests
- Unit: planCatchUp does not return a later pole; miss-cost still uses the second clock at this stop.
- Playwright: 就乘 then 錯過了 shows next-of-route (and 85X on Transfer); Arrivals no longer shows a walk-to-later-stop row.

---

## 3.3.0 — 2026-09-12

### Changed
- **趕這一班** is no longer only for a wait of three minutes or less. Any live clock (or a bus that already left the pole) can open 趕車助手, on **巴士／小巴** route search and on **轉乘助手**.
- Standard bus search now has the same lock as Transfer Buddy. Each live trip has **就乘這一程**. Auto-refresh stays on that clock and does not snap to the next bus. **趕這一班** also locks that trip. Tapping a nearby-board clock locks that same clock after the stop loads. Changing the boarding stop or searching a new route clears the lock; changing destination keeps it.
- If the locked clock leaves the operator feed, the app keeps showing that trip. The next bus of the same route is still listed, but it is not labelled 趕這一班. An empty feed stays empty.

### Tests
- Unit tests: catch-up allowed at 7 and 15 minutes; lock follows a ticking clock and does not pick the next bus.
- Playwright: Transfer Buddy 趕 still appears at an 8-minute wait; Arrivals with mocked 7- and 15-minute clocks shows two 趕 buttons, 就乘 locks, and 趕 opens the catch-up card.

---

## 3.2.0 — 2026-09-12

### Changed
- hkbus’s street question is “what is coming at this pole”. If there is **no last bus** to restore, Arrivals now loads **附近到站** from GPS on first open — you do not have to tap the button. An empty operator feed stays empty. Location denied still leaves the route box; it does not invent clocks.
- A saved last bus still restores on Arrivals and skips auto nearby, so you are not prompted for GPS just to reopen yesterday’s trip. Saved 回家附近 / 返工附近 still do not steal the tab.

### Tests
- Unit tests for when a last-bus pref is restorable.
- Playwright: first open with no last bus shows the mocked nearby board on Arrivals; last-bus restore still hides auto nearby.

---

## 3.1.0 — 2026-09-12

### Changed
- Home nearby / work nearby now behave like a live board you reopen, not a bookmark that dumps you onto 我的回家路線. Saving **儲存為回家附近** or **儲存為返工附近** stays on Arrivals and shows a short confirmation. Saving again replaces the previous place of that kind so there is only one home and one work.
- Arrivals shows chips **回家附近** / **返工附近** so you can reopen that GPS board without searching. 我的回家路線 lists those collections above saved bus / transfer / MTR routes; **開啟實時到站** reloads what the operator is publishing now. An empty feed stays empty.
- Saved collections still do not steal the arrivals tab on first open. Opening a collection focuses the nearby board and leaves the last typed trip below it.

### Tests
- Unit tests for one-home-one-work replace and collapsing duplicate collections.
- Playwright: save stays on arrivals, a second save keeps one chip, Open reloads the mocked board, tapping a row still locks that trip.

---

## 3.0.3 — 2026-09-12

### Fixed
- 鐘面／倒數 was swapped: picking **鐘面** still put minutes in the big number, and **倒數** put the clock there. The prominent ETA now follows the control. 開車／到達 and 沿途各站 stay as wall clocks so a countdown view does not turn hop times into another wait.
- Nearby-board fetch failures were labelled as “未能取得位置”. Location denial stays `geoDenied`; an API miss now says it could not load, and an empty operator feed still stays empty.
- 港鐵巴士 stop ETAs only scanned the first eight feeder routes when the pole had no route hint, so a live **K18** (or later) at that pole never appeared. All published MTR Bus routes are queried; timetable-only (`isScheduled`) rows stay hidden.
- K12 (and other MTR Bus) live `getSchedule` rows have stop ids but no names. The boarding list is now filled from MTR’s published data dictionary (八號花園, 大埔墟站, …), not left blank and not invented.

### Tests
- Unit tests for clock vs countdown, MTR Bus scheduled-vs-live parsing, and nearby board grouping (KMB vs GMB, empty feed).
- Playwright: K12 search, clock toggle on nearby board, nearby GPS board.
- API smoke: directory includes MTRB, K12 search-live / route-stop / eta, `/api/nearby-board` at TST.

---

## 3.0.2 — 2026-09-06

### Changed
- Versioning is now always `x.y.z` (this file + `package.json` + git tags `vX.Y.Z`).
- Cursor always-on rule `.cursor/rules/versioning.mdc`: bump and write a detailed changelog after every product change.
- Replaced the short two-part tags (`v1.0` … `v1.11`) that under-counted the chat.

---

## 3.0.1 — 2026-09-06

### Added
- First version log and a copy of the original paste at `versions/v1.0-original.html`.
- Branch `archive/v1.0` holds only that HTML.

---

## 3.0.0 — 2026-09-06 · `99b37d9`

**Major.** Stop-to-stop planning, 趕車助手 (catch-up / 錯過代價), and 出門規劃 (leave-home) shipped as first-class product, not Transfer Buddy extras.

### Added
- Journey search from an origin area to a destination area with first route optional. Compares live direct vs one-transfer; faster arrival ranks first. Honesty line: only routes that currently have live buses, not a guaranteed Hong Kong-wide shortest path.
- Transfer stop no longer required; the system can pick the interchange.
- Group similar journey options into one card instead of up to ten look-alike cards.
- 趕車助手: stay / leave decision with a miss-cost, not a pile of independent numbers.
- 出門規劃: plan days ahead for when to leave home, using schedule/traffic language, not invented ETAs.
- Fare-aware ranking: a cheaper Octopus option can beat a slightly slower one. Time-vs-money uses a wage-like rate, not $2 per minute (user: that was too high).
- Official TD topology / CSDI path cache so Citybus and minibus graphs can load (user: 梁潔華小學 → 第一城 showed “城巴／小巴路線圖尚未載入”; 798 → 89C/680/85X/682 had to be a real option).

### Fixed
- Planner was effectively KMB-only; Citybus and GMB had to participate (廣源 → 九龍醫院 empty; 第一城 → 尖沙咀碼頭 empty).
- “找不到此路線” when a first-leg route was typed on an origin/dest search.
- Empty “目前找不到由起點到終點的實時巴士／小巴” on trips that do exist in the street.

---

## 2.9.1 — 2026-09-02 · `a85abd4`

### Fixed
- Search skipped minibuses when a KMB route with the same number existed. User: minibuses were missing and “not just that which is failing.” Lookup GMB during search.

---

## 2.9.0 — 2026-08-29 · `7147f5a`

**Minor.** Transfer Buddy reliability pass; drop modes that were hurting the product.

### Changed
- Search Transfer / arrivals only on 查詢 — do not auto-search while typing.
- Keep a good transfer result instead of wiping it on the next keystroke.
- Combine transfer options so the user is not scrolling a huge list.
- **Removed Light Rail** from the product for now (timing bugs, extra noise).
- **Removed 路線地圖練習場** (duplicate playground).
- Transfer Buddy user manual was broken; rebuild with the rest of the guide.

### Fixed
- “All modes do not work” on production (29 Aug). Same-origin `/api` and Transfer follow-along had to work again on Vercel, then this cleanup.

---

## 2.8.0 — 2026-08-29 · `41147a3`

### Changed
- Live arrivals sit **above** the map so times are not hidden under the map on phones.

### Fixed
- Transfer connections missed nearby Citybus poles (alight vs board at 青沙 / 西隧-style pairs). Search nearby CTB stops for the second leg.

---

## 2.7.7 — 2026-08-27 · `bbcad7e`

### Fixed
- `673` 查詢 → 「查詢逾時，目前找不到巴士」 even though 673 is a known directory route. List the route from the directory instead of failing the whole search on a slow live merge.
- Transfer first-leg 673 塘坑 (ND247) showed no departure time while still offering 大老山隧道 (screenshot 26 Aug). First-bus times must not wait on fares or every other route at the stop (`fef5a03` same week).

---

## 2.7.6 — 2026-08-26 · `fef5a03`

### Fixed
- First-bus times waited on fare tables and every other route at the pole, so Transfer looked empty on a live route.

---

## 2.7.5 — 2026-08-26 · `3624ed7`

### Fixed
- CI live-search had less patience than street tests and failed when the fare table was not loaded.

---

## 2.7.4 — 2026-08-26 · `af0ead7`

### Fixed
- CI warmed the wrong surface; wait on `/api/status` instead of fare attachment.

---

## 2.7.3 — 2026-08-26 · `dfc9dca`

### Changed
- If the official CSDI feed is down, CI may accept an honest straight bus path instead of failing the build.

---

## 2.7.2 — 2026-08-26 · `6e60fa2`

### Changed
- First open restores the last **巴士／小巴** trip so the default tab is a live answer, not an empty 我的回家路線.

---

## 2.7.1 — 2026-08-26 · `7fe6057`

### Changed
- Do not open 我的回家路線 on first load.
- Light Rail listed first among rail when that tab existed, with real clocks.
- `/api/status` stays cheap so the app boots instead of waiting on the full stop directory.

---

## 2.7.0 — 2026-08-26 · `938942e`

**Minor.** Light Rail clocks + Transfer Buddy live lock + boot.

### Added
- Light Rail: times at **this stop**, same honesty as bus/MTR (user: “i cannot see any timing for light rail”).
- Cursor product rule `.cursor/rules/transitbuddy.mdc` (honesty, 轉乘助手 lock, port 3001, no invented ETAs).

### Changed
- Transfer Buddy **stays on the chosen trip**. Never snap to the next bus. UI: 正在留意這一班第一程.
- Skip unused directory wrappers at startup.

### Fixed
- File/code size pass so old phones are not waiting on dead weight.

---

## 2.6.1 — 2026-08-26 · `afd3382`

### Changed
- Portrait phones: 2×2 tab layout so tabs, map, and times fit without sideways scroll. User asked for 100% mobile / portrait.

---

## 2.6.0 — 2026-08-26 · `a54acb4`

**Minor.** Map becomes the stop picker.

### Changed
- Replace the long stop list with a map plus boarding-stop selector.
- Tapping a numbered stop loads **live arrivals** (same board as the arrivals tab), not a dead map page.
- Return search JSON before Vercel kills the request (製作超時).

### Fixed
- Phone layout: header, tabs, map height, arrivals under the map.

---

## 2.5.0 — 2026-08-25 · `7dca070`

**Minor.** Honest route geometry.

### Changed
- Draw **official Transport Department** bus paths, not guessed road-follow lines.
- **Removed GPS nearby-stop map** that overwrote arrivals (user: “it destroys the whole things”).

---

## 2.4.2 — 2026-08-25 · `bbe6711`

### Fixed
- Route lines U-turned onto the opposite carriageway or traced the same street twice.

---

## 2.4.1 — 2026-08-25 · `ba4bc50`

### Fixed
- Live search turtle-slow; Lantau (NLB) missing; road lines jumping across the map.

---

## 2.4.0 — 2026-08-25 · `eb136b2`

**Minor.** Road-following lines, operator colours, playground (later removed in 2.9.0).

### Added
- Route line along roads with operator colours.
- 路線地圖練習場 so the map could be reviewed (friend’s OSM line-drawing).

### Changed
- Friend UI colours: not blank white; “kid feel” but not over-colourful (soft crayon restyle in the same week).

---

## 2.3.3 — 2026-08-25 · `20c6a20`

### Fixed
- Vercel timeouts and missing Citybus names; simpler stop picker.

---

## 2.3.2 — 2026-08-25 · `7cb8317`

### Fixed
- Production showed 「無法連線到本機 3001 埠」. Same-origin `/api` failures are not a localhost outage.

---

## 2.3.1 — 2026-08-20 · `367ae09`

### Fixed
- Citybus smoke tests must stay honest when the route-stop API is blocked (empty, not invented names).

---

## 2.3.0 — 2026-08-20 · `457c4c6`

**Minor.** Live-first search, OSM nearby map, hkbus-style 分段收費, in-app + PDF manuals.

### Added
- Live-first search merge.
- OSM nearby map (later replaced as the main picker in 2.6.0).
- Section fares readable in the hkbus.app style (previous table was “basically unreadable”).
- 使用說明 in-app and a multi-page PDF user manual.

### Changed
- Exact route matches always first (search `81` was wrong).
- Do not rank a perfect match that is **not in operation** above a live service.
- Hide impossible transfer stops (interchange earlier than the boarding stop).
- Every Transfer / direct card can expand 查看各站時間 (intermediate + final).
- 00-required/ extract: Transfer Buddy, stop times, Light Rail, MTR core for use elsewhere (22 Aug).

### Fixed
- Citybus stops showing raw stop ids instead of names.
- Duplicate `GET` in `app/api/gmb/lookup/route.js` (build error).
- Airport Express 往香港 查看各站時間 empty while 往博覽館 worked.
- Code-size pass for old phones.

---

## 2.2.0 — 2026-08-20 · `65faa3c`

**Minor.** Minibus is a first-class operator.

### Added
- GMB live ETAs, route lookup, stop list.
- Fuzzy route search with explicit ranking: missing suffix/prefix, then number-in-front, then contains (user may omit `X`).
- Hop-time caps; empty-destination follow-along.

### Fixed
- Minibus **62** did not work.
- **811** is 專線小巴, not 九巴. KMB 811 does not exist; stops were GMB. Company badge + ETA must be GMB. Frequent 811 must not show a 2-minute guessed hop as if it were KMB.
- Bookmarks (我的回家路線) save on-device without sign-in; say so in the UI.
- Peak-only route at off-peak: do not say 「目前找不到巴士」 as if the route does not exist — explain schedule.
- 962 vs 952 hop times (122 vs 77 min): rush-hour buffer must not look like a random guess; mark 估計.
- 查看各站時間 must work when destination is empty.
- MTR: full per-station test; some stations/lines failed 查看各站時間.
- Standalone HTML: Transfer follow-along is the key part — do as much as same-origin `/api` allows; without the server, hop times stay estimated.

---

## 2.1.0 — 2026-08-16 · `4e2a2c2`

**Minor.** Field convenience on top of the first Next.js ship.

### Added
- Nearby stops.
- Discount listing in the UI.
- Transfer flow: after input, show upcoming departures (and a direct if there is one); user picks the first bus; then time the interchange from **that** bus’s live arrival at the interchange — not a guessed clock.
- 青沙 / similar BBI: alight stop and board stop can be different poles (TA750 vs TA753). Treat them as a pair.
- Stop-by-stop hop prediction (user: station-by-station is extremely reliable). Three times per stop: previous bus, this bus, next — never invent a bus that jumped forward in the list. If this bus is missing, walk previous buses in the list.
- TDAS / distance as a **slower-than-car** bus speed, not car speed. Highways: cars 100–110, bus typical cap ~60–65 including ramps. Formula, not a vibe.
- 49X / 74X stress: Tsing Yi Pier–Shing Mun, Tai Po Centre–Tate’s Cairn. Luk Yeung +8 min bug: Chung On Street → Luk Yeung is ~3 min; Luk Yeung → Shing Mun ~5–6. Tate’s Cairn is Sha Tin side; Tai Po → tunnel is long.
- 277X Wah Ming → Tate’s Cairn: 13 min was wrong; do not pick an impossible early bus; 70% highway cap was too strict (dropped to “not faster than highway”).
- Remove onboard/wait selector — user should not re-enter the trip when they board. System follows the chosen first bus live (can they still catch the second, or an earlier one?).
- MTR: optional destination on the **selected line**; only trains that serve that dest; same stop-by-stop idea as bus. Airport Express vs Tung Chung to 青衣 must not show TCL faster than AEL.
- 查看各站時間 button on Transfer, MTR, and bus.
- JSON_BUS.json fares into the system and Supabase; full 分段收費 + interchange discount tables from TD / operators.
- Standalone HTML aligned with fullstack; works on OneCompiler-style hosts with degraded Transfer (estimates).
- Portrait/landscape mobile layout for both Next and standalone.

---

## 2.0.6 — 2026-08-16 · `6b22aae`

### Changed
- Env: only Supabase URL, publishable key, and secret key (no legacy anon/service names). `.env.local` template for Vercel.

---

## 2.0.5 — 2026-08-16 · `75831fe`

### Added
- README steps for GitHub + Vercel as **miltoncwlam@gmail.com** / repo `transithelper`.

---

## 2.0.4 — 2026-08-16 · `588ac94`

### Fixed
- Trace Next.js runtime helpers into Vercel serverless bundles.

---

## 2.0.3 — 2026-08-16 · `92d53ce`

### Fixed
- Include `@swc/helpers` so Vercel remote builds resolve Next.js runtime files.

---

## 2.0.2 — 2026-08-16 · `8ff3090`

### Changed
- Keep cron out of `vercel.json` so a claimable Hobby deploy works (`*/10` is not allowed; daily warm only).

---

## 2.0.1 — 2026-08-16 · `29df5a5`

### Fixed
- API import paths so `next build` succeeds.

---

## 2.0.0 — 2026-08-16 · `142a27f`

**Major.** Empty repo → Next.js TransitBuddy. Same-origin `/api`, not a browser-only page.

### Added
- Next.js app on port **3001** (user: migrate off default 3000).
- Aligned `standalone.html` in the same project.
- KMB / LWB / Citybus / MTR proxies, Transfer search, saved homes, discounts.
- Traditional Chinese default; English toggle. Minimize backend codes in the UI.
- Smoke checks (MTR 荃灣綫尖沙咀, 東鐵太和, 馬場 empty-or-honest, KMB 1).
- GitHub `transithelper` + Vercel + Supabase wiring.

### Honesty
- Empty operator feed = empty UI. No invented ETAs.

---

## 1.0.0 — 2026-08-16 · `archive/v1.0`

**Major.** The HTML file originally pasted into chat.

Single page, Tailwind CDN, public KMB / 龍運 / 城巴 / MTR APIs from the browser. Tabs for arrivals, 港鐵, 轉乘助手, 我的回家路線. No Next.js, no `/api`.

File: [`versions/v1.0-original.html`](versions/v1.0-original.html) and [original.html on archive/v1.0](https://github.com/miltoncwlam/transithelper/blob/archive/v1.0/original.html).
