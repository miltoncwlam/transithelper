# TransitBuddy version log

Record of every shipped version, starting from the original HTML paste (**V1.0**, 16 Aug 2026).

Repo on GitHub: [miltoncwlam/transithelper](https://github.com/miltoncwlam/transithelper).

To open an old version:

```bash
git fetch origin --tags
git checkout v1.0    # original HTML only
git checkout v1.7    # example: Light Rail + boot fixes
git checkout main    # current
```

Each tag is also a [GitHub Release](https://github.com/miltoncwlam/transithelper/releases). The original paste is on branch `archive/v1.0` and in [`versions/v1.0-original.html`](versions/v1.0-original.html) on `main`.

## Logsheet

| Version | Date | Git tag | Commit | What this version is |
|---|---|---|---|---|
| **V1.0** | 2026-08-16 | `v1.0` | `archive/v1.0` | The HTML file originally sent into chat. Single page, Tailwind CDN, KMB / 龍運 / 城巴 live arrivals, 港鐵, 轉乘助手, 我的回家路線. No Next.js server. |
| **V1.1** | 2026-08-16 | `v1.1` | `142a27f` | First repo ship: Next.js app, `/api`, smoke checks, saved homes, discounts. |
| **V1.2** | 2026-08-16 | `v1.2` | `4e2a2c2` | Nearby stops, discount listing, field-use extras. Deploy/build/Supabase key docs from the same day are in this tag. |
| **V1.3** | 2026-08-20 | `v1.3` | `65faa3c` | GMB live ETAs, fuzzy route search, hop-time caps, empty-destination follow-along. |
| **V1.4** | 2026-08-20 | `v1.4` | `457c4c6` | Live-first search, OSM nearby map, hkbus-style fares, bilingual in-app + PDF manuals. |
| **V1.5** | 2026-08-25 | `v1.5` | `7dca070` | Official Transport Department bus paths. GPS nearby map no longer overwrites arrivals. |
| **V1.6** | 2026-08-26 | `v1.6` | `a54acb4` | Map + boarding-stop selector instead of a long stop list. Tighter phone layout. |
| **V1.7** | 2026-08-26 | `v1.7` | `6e60fa2` | Light Rail clocks, Transfer Buddy stays on the chosen trip, last 巴士／小巴 trip restored on open, cheaper `/api/status` boot. |
| **V1.8** | 2026-08-29 | `v1.8` | `41147a3` | Live arrivals above the map. Nearby Citybus poles used for transfer connections. |
| **V1.9** | 2026-08-29 | `v1.9` | `7147f5a` | Keep a good transfer result, search only on 查詢, drop Light Rail tab and the route playground. |
| **V1.10** | 2026-09-02 | `v1.10` | `a85abd4` | Search looks up minibuses instead of skipping them when a KMB route with the same number exists. |
| **V1.11** | 2026-09-06 | `v1.11` | `99b37d9` | Stop-to-stop planning, catch-up helper, leave-home estimates. Current product on `main` (plus this logsheet). |

GitHub tree for a tag: `https://github.com/miltoncwlam/transithelper/tree/v1.1`

## How V1.0 became the app

On 16 Aug 2026 the working tree was empty. The pasted HTML was rebuilt as a Next.js app (V1.1) so live KMB / MTR / transfer calls could go through same-origin `/api` instead of the browser. Later versions added GMB, maps, 分段收費, 轉乘助手 lock-on, and planning. The original file is unchanged in `versions/v1.0-original.html`.

## Full git history (every commit on `main`)

These are the commits that already lived on GitHub before this logsheet. Tags above point at the product drops; every commit in between is listed here so nothing is missing.

| Date | Commit | Message |
|---|---|---|
| 2026-08-16 | [`142a27f`](https://github.com/miltoncwlam/transithelper/commit/142a27f) | Ship the Next.js TransitBuddy app with smoke checks, homes, and discounts. |
| 2026-08-16 | [`29df5a5`](https://github.com/miltoncwlam/transithelper/commit/29df5a5) | Fix API import paths so the Next.js production build succeeds. |
| 2026-08-16 | [`8ff3090`](https://github.com/miltoncwlam/transithelper/commit/8ff3090) | Allow a claimable Vercel deploy by keeping cron config out of vercel.json. |
| 2026-08-16 | [`92d53ce`](https://github.com/miltoncwlam/transithelper/commit/92d53ce) | Include @swc/helpers so Vercel remote builds can resolve Next.js runtime files. |
| 2026-08-16 | [`588ac94`](https://github.com/miltoncwlam/transithelper/commit/588ac94) | Trace Next.js runtime helpers into Vercel serverless bundles. |
| 2026-08-16 | [`75831fe`](https://github.com/miltoncwlam/transithelper/commit/75831fe) | Document GitHub and Vercel steps for miltoncwlam@gmail.com. |
| 2026-08-16 | [`6b22aae`](https://github.com/miltoncwlam/transithelper/commit/6b22aae) | Use only the Supabase URL, publishable key, and secret key. |
| 2026-08-16 | [`4e2a2c2`](https://github.com/miltoncwlam/transithelper/commit/4e2a2c2) | Add nearby stops, discount listing, and field-use conveniences. |
| 2026-08-20 | [`65faa3c`](https://github.com/miltoncwlam/transithelper/commit/65faa3c) | Add GMB live ETAs, fuzzy route search, hop-time caps, and empty-dest follow-along so field trips stay useful when live data or dest is missing. |
| 2026-08-20 | [`457c4c6`](https://github.com/miltoncwlam/transithelper/commit/457c4c6) | Add live-first search, OSM nearby map, hkbus-style fares, and bilingual in-app plus PDF manuals. |
| 2026-08-20 | [`367ae09`](https://github.com/miltoncwlam/transithelper/commit/367ae09) | Keep Citybus smoke honest when the route-stop API is blocked. |
| 2026-08-25 | [`7cb8317`](https://github.com/miltoncwlam/transithelper/commit/7cb8317) | Stop Vercel from treating same-origin API failures as a localhost:3001 outage. |
| 2026-08-25 | [`20c6a20`](https://github.com/miltoncwlam/transithelper/commit/20c6a20) | Fix Vercel timeouts and missing Citybus names, then simplify the stop picker. |
| 2026-08-25 | [`eb136b2`](https://github.com/miltoncwlam/transithelper/commit/eb136b2) | Draw bus routes along roads with operator colours, and add a playground so the map is honest and reviewable. |
| 2026-08-25 | [`ba4bc50`](https://github.com/miltoncwlam/transithelper/commit/ba4bc50) | Speed up live search and keep Lantau buses visible, and draw road lines that no longer jump across the map. |
| 2026-08-25 | [`bbe6711`](https://github.com/miltoncwlam/transithelper/commit/bbe6711) | Stop route lines from U-turning onto the opposite carriageway or doubling back over the same street. |
| 2026-08-25 | [`7dca070`](https://github.com/miltoncwlam/transithelper/commit/7dca070) | Remove the GPS nearby-stop map that overwrote arrivals, and draw official Transport Department bus paths instead of guessed road lines. |
| 2026-08-26 | [`a54acb4`](https://github.com/miltoncwlam/transithelper/commit/a54acb4) | Replace the long stop list with a map plus boarding-stop selector, tighten the phone layout, and return search JSON before Vercel kills the request. |
| 2026-08-26 | [`afd3382`](https://github.com/miltoncwlam/transithelper/commit/afd3382) | Keep portrait phones on a 2×2 layout so tabs, maps, and times fit without sideways scroll. |
| 2026-08-26 | [`938942e`](https://github.com/miltoncwlam/transithelper/commit/938942e) | Show Light Rail clocks at this stop, keep Transfer Buddy locked on the chosen trip, and skip unused wrappers so startup does not wait on the full stop directory. |
| 2026-08-26 | [`7fe6057`](https://github.com/miltoncwlam/transithelper/commit/7fe6057) | Stop opening 我的回家路線 on first load, put Light Rail first with real clocks, and keep /api/status cheap so the app boots. |
| 2026-08-26 | [`6e60fa2`](https://github.com/miltoncwlam/transithelper/commit/6e60fa2) | Restore the last 巴士／小巴 trip on first open so the default tab is a live answer. |
| 2026-08-26 | [`dfc9dca`](https://github.com/miltoncwlam/transithelper/commit/dfc9dca) | Accept an honest straight bus path in CI when the official CSDI feed is unreachable. |
| 2026-08-26 | [`af0ead7`](https://github.com/miltoncwlam/transithelper/commit/af0ead7) | Warm CI against /api/status so tests do not wait on fare attachment. |
| 2026-08-26 | [`3624ed7`](https://github.com/miltoncwlam/transithelper/commit/3624ed7) | Give CI live-search the same patience as the street tests, and do not fail when the fare table is not loaded. |
| 2026-08-26 | [`fef5a03`](https://github.com/miltoncwlam/transithelper/commit/fef5a03) | Show first-bus times without waiting on fares or every other route at the stop. |
| 2026-08-27 | [`bbcad7e`](https://github.com/miltoncwlam/transithelper/commit/bbcad7e) | List a known bus route from the directory instead of showing a search timeout. |
| 2026-08-29 | [`41147a3`](https://github.com/miltoncwlam/transithelper/commit/41147a3) | Put live arrivals above the map so they are not hidden, and search nearby Citybus poles for transfer connections. |
| 2026-08-29 | [`7147f5a`](https://github.com/miltoncwlam/transithelper/commit/7147f5a) | Keep a good transfer result, search only on 查詢, and drop Light Rail and the playground. |
| 2026-09-02 | [`a85abd4`](https://github.com/miltoncwlam/transithelper/commit/a85abd4) | Look up minibuses during search instead of skipping them when KMB is already listed. |
| 2026-09-06 | [`99b37d9`](https://github.com/miltoncwlam/transithelper/commit/99b37d9) | Ship stop-to-stop planning, catch-up, and leave-home estimates. |
