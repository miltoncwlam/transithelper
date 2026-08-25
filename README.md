# TransitBuddy

Hong Kong live bus, minibus (GMB), and MTR helper. Default language is Traditional Chinese. Local development always uses port **3001**.

**Transfer Buddy, stop-time calculation, Light Rail, and MTR** — copyable core lives in [`00-required/`](00-required/README.md) (`/Users/milton/TransitBuddy/00-required`). Zip that folder to use the same code elsewhere.

## Stage 1 — Run locally

```bash
npm install
npm run dev
```

Open http://127.0.0.1:3001 and http://127.0.0.1:3001/standalone.html.

`standalone.html` is a single file. On the Next.js server it uses `/api/*` (full Transfer follow-along, fares, saved homes). Without that server — OneCompiler, a paste, `?direct=1` — it calls KMB / Citybus / GMB / MTR public APIs itself. Transfer arrival times are then estimated from stop counts; homes stay in the browser. Rebuild the single file after UI edits:

```bash
npm run bundle-standalone
```


If the browser shows **ERR_CONNECTION_REFUSED** on port 3001, the Next.js process is not running. That is not a frontend bug. Start `npm run dev` in this folder, then refresh.

```bash
npm run smoke
```

Smoke checks MTR (荃灣綫尖沙咀, 東鐵太和, 馬場 empty-or-honest), KMB route 1, `/`, `/standalone.html`, and `/api/status`. Production mode: `npm run build && npm run start`.

After UI copy changes, keep React and the HTML twin aligned:

```bash
npm run sync-i18n
npm run bundle-standalone
```

## Stage 2 — GitHub and Vercel

Use **miltoncwlam@gmail.com** (GitHub user `miltoncwlam`). SSH from this machine already authenticates as that user.

1. In the browser, create an empty repo: https://github.com/new — name `TransitBuddy`, no README.
2. From this folder: `git push -u origin main`
3. Sign in to Vercel with the same Gmail, import that repo (framework Next.js, root = this project, production = `main`).
4. Anonymous CLI deploys of Next.js 15 fail (missing `node_modules` in the upload). A logged-in Git import is required.

KMB and MTR public APIs need no env vars. Production `vercel.json` warms `/api/cron/warm` once a day at `0 20 * * *` UTC (morning in Hong Kong). Hobby plans cannot run `*/10`. The first request after a cold start still loads the directory.

On Vercel set:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`

Then redeploy. Confirm `/`, `/standalone.html`, and `/api/status`. Save a home on the live URL and refresh; it should still be there after the SQL below.

## Stage 3 — Supabase (your account)

The Cursor plugin is currently signed into the flashcard org (`interns@aail.ai`). Use **miltoncwlam@gmail.com** for GitHub, Vercel, and Supabase. Create a dedicated **TransitBuddy** project on that account (Singapore `ap-southeast-1` is a reasonable region for Hong Kong). Do not reuse the flashcard projects.

1. Re-auth the Supabase plugin / dashboard to that account.
2. Create the project, then in the SQL editor run `supabase/migrations/20260816130000_homes_and_discounts.sql` and `supabase/migrations/20260816140000_bus_section_fares_and_bbi.sql` (project ref `qwhjzpmhwougxmlqdbzs` if that is yours).
3. Copy `.env.example` to `.env.local` and set:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY` (server only — never `NEXT_PUBLIC_`)
4. Put the same vars on Vercel.

Without those vars, saved homes fall back to a local `data/homes.json` file, which does not survive a new Vercel instance. With them, homes persist by device id (`X-Device-Id` / `tb-device` in localStorage). Email login across phones is optional later (`saved_homes.user_id`).

## Stage 4 — Section fares and interchange discounts

Transport Department `FARE_BUS.xml` / `FARE_GMB.xml` is the on-stop → off-stop 分段收費 matrix (updated twice a month). KMB publishes BBI JSON; Citybus publishes concession API pages. After the SQL above:

```bash
npm run import-bus-fares
```

That writes public Storage `bus-fares/routes.json` and `bus-fares/discounts.json`, and upserts `bus_fare_routes` / `bus_interchange_discounts` when those tables exist. Re-run when TD or the operators update.

- `GET /api/fares?route=960&co=KMB&bound=O&on=15&off=22` — 全程, unique 分段, and the boarding→alight fare.
- `GET /api/discounts?from=960&to=961` — operator-published Octopus amounts (減 / 免費 / 兩程合共). The UI still says to confirm on the bus reader.
- Transfer Buddy attaches the first-bus 分段 (board → interchange) and the second-bus 分段 plus a matching BBI row.

Query examples in the SQL editor:

```sql
select route_name, bound, orig_zh, dest_zh, full_fare_hkd, section_prices
from bus_fare_routes
where route_name = '960';

select from_route, to_route, discount_type, discount_amount_hkd, window_minutes, interchange_zh
from bus_interchange_discounts
where from_route = '960' and to_route = '961';
```

The older `interchange_discounts` notes table remains as a fallback if Storage has not been imported yet.

## Stage 5 — Product

Chinese is the default. Language is stored in `localStorage` (`tb-lang`) and shared by React and `public/standalone.html`. Boarding stop is required. Arrivals and MTR can optionally pick a destination on the same route/line; only trips that go there are listed, with a predicted arrival from the same follow-along timing as Transfer Buddy. Transfer helper first lists upcoming first-bus departures at the boarding stop (and any direct buses). After you pick a departure, it times arrival at the transfer stop and shows the best connecting bus plus up to two later options. Homes restore arrivals, transfers, and MTR in one tap and can be pinned.

In-app **使用說明 / Guide** is the header button (follows `tb-lang`). The full bilingual PDF is `/user-manual.pdf` (HTML source `public/user-manual.html`, copy in `lib/guide.js`, rebuild with `npm run build-manual`). The user-facing PDF does not mention localhost or development ports.

## Friend UI contract

Keep `/api/*`.

- Language: `localStorage tb-lang` (`zh` default, or `en`).
- Device: `localStorage tb-device`; send `X-Device-Id` on `/api/homes`.
- `GET /api/citybus/stop-eta/[stop]` — all Citybus arrivals at that stop.
- `GET /api/kmb/stop-eta/[stop]` — arrivals at that stop (group by route + destination name, not bound codes).
- `GET /api/discounts` — `{ count, pairs }`. `GET /api/discounts?from=960&to=961` — matching Octopus interchange rows.
- `GET /api/fares?route=&co=&bound=&on=&off=` — full fare, section stages, and optional boarding→alight 分段.
- `GET /api/mtr/schedule?line=&sta=&dest=` — `dest` is optional. When set, only trains that serve that station on the line are listed, with a predicted arrival.
- `POST /api/ride` — `{ first, boardStops, destStops }` follows the selected bus to `destStops` using the same live pairing as Transfer Buddy.
- `POST /api/transfer` — `phase: "departures"` lists first-bus ETAs at the boarding stop plus directs; `phase: "connections"` with `selectedDeparture` times the interchange and ranks the best transfer.
- `GET/POST /api/homes`, `PATCH/DELETE /api/homes/:id`.

## Stage 6 — Later extras already wired

- Citybus routes (both directions) are in the directory; stop names are loaded with each route. Transfer also uses Citybus after the stop list has been cached (first run hydrates in the background). GMB is looked up by route number.
- Transfer timing uses Transport Department GTFS scheduled trip length (scaled along the stop path) when the index is ready, otherwise urban/highway hop speeds from stop coordinates. Live interchange ETAs are only used if they fit that same first-bus trip.
- Directory is cached under the OS temp dir; Vercel hits `/api/cron/warm` once a day.
- Playwright: `npx playwright install chromium` then `npm test`.
- PWA: `public/manifest.json` and `public/sw.js` (production / non-localhost).
