# TransitBuddy

Hong Kong live bus and MTR helper. Default language is Traditional Chinese. Local development always uses port **3001**.

## Stage 1 — Run locally

```bash
npm install
npm run dev
```

Open http://127.0.0.1:3001 and http://127.0.0.1:3001/standalone.html.

If the browser shows **ERR_CONNECTION_REFUSED** on port 3001, the Next.js process is not running. That is not a frontend bug. Start `npm run dev` in this folder, then refresh.

```bash
npm run smoke
```

Smoke checks MTR (荃灣綫尖沙咀, 東鐵太和, 馬場 empty-or-honest), KMB route 1, `/`, `/standalone.html`, and `/api/status`. Production mode: `npm run build && npm run start`.

After UI copy changes, keep React and the HTML twin aligned:

```bash
npm run sync-i18n
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
2. Create the project, then in the SQL editor run `supabase/migrations/20260816130000_homes_and_discounts.sql` (project ref `qwhjzpmhwougxmlqdbzs` if that is yours). Extra BBI rows: table editor only, sourced notes, no invented HKD.
3. Copy `.env.example` to `.env.local` and set:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY` (server only — never `NEXT_PUBLIC_`)
4. Put the same vars on Vercel.

Without those vars, saved homes fall back to a local `data/homes.json` file, which does not survive a new Vercel instance. With them, homes persist by device id (`X-Device-Id` / `tb-device` in localStorage). Email login across phones is optional later (`saved_homes.user_id`).

## Stage 4 — Interchange discounts

Transfer Buddy attaches sourced 八達通轉乘優惠 notes from `interchange_discounts` (or the built-in 960↔961 fallback). Dollar amounts are not invented; the UI says to confirm on the bus reader. Edit rows in the Supabase table editor. Unknown pairs stay silent.

## Stage 5 — Product

Chinese is the default. Language is stored in `localStorage` (`tb-lang`) and shared by React and `public/standalone.html`. Boarding stop is required when the journey state is “尚未上車”. Transfer results are one combined list with first-bus interchange arrival shown first. Homes restore arrivals, transfers, and MTR in one tap and can be pinned.

## Friend UI contract

Keep `/api/*`. GPS stop-first is optional.

- Language: `localStorage tb-lang` (`zh` default, or `en`).
- Device: `localStorage tb-device`; send `X-Device-Id` on `/api/homes`.
- `GET /api/stops/nearby?lat=&lng=&radius=250` — named stops with `metres`.
- `GET /api/kmb/stop-eta/[stop]` — arrivals at that stop (group by route + destination name, not bound codes).
- `GET /api/discounts` — active Octopus interchange notes.
- `GET/POST /api/homes`, `PATCH/DELETE /api/homes/:id`.

## Stage 6 — Later extras already wired

- Citybus routes are merged into the directory; GMB is looked up by route number.
- Transfer walk time uses stop coordinates instead of a flat 2 minutes.
- Directory is cached under the OS temp dir; Vercel hits `/api/cron/warm` once a day.
- Playwright: `npx playwright install chromium` then `npm test`.
- PWA: `public/manifest.json` and `public/sw.js` (production / non-localhost).
