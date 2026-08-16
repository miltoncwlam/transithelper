-- Apply on the TransitBuddy Supabase project (your account, not the flashcard org).
-- Discounts: published rows are readable with the anon / publishable key.
-- Homes: no anon policies. The Next.js API uses SUPABASE_SECRET_KEY (server only)
-- and filters by X-Device-Id. Optional later: set user_id from auth.uid() for email login.

create table if not exists public.interchange_discounts (
  id uuid primary key default gen_random_uuid(),
  from_operator text not null default 'KMB',
  to_operator text not null default 'KMB',
  from_route text,
  to_route text,
  discount_amount_hkd numeric(6,1),
  discount_percent numeric(5,2),
  window_minutes integer not null default 60,
  same_card boolean not null default true,
  notes_zh text,
  notes_en text,
  source_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists interchange_discounts_routes_idx
  on public.interchange_discounts (from_route, to_route)
  where active = true;

alter table public.interchange_discounts enable row level security;

drop policy if exists interchange_discounts_read on public.interchange_discounts;
create policy interchange_discounts_read
  on public.interchange_discounts
  for select
  to anon, authenticated
  using (active = true);

create table if not exists public.saved_homes (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  user_id uuid,
  type text not null,
  title jsonb not null,
  subtitle jsonb,
  payload jsonb not null,
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists saved_homes_device_idx
  on public.saved_homes (device_id, pinned desc, created_at desc);

alter table public.saved_homes enable row level security;

drop policy if exists saved_homes_device_all on public.saved_homes;

-- Optional later: email login across phones.
drop policy if exists saved_homes_own_user on public.saved_homes;
create policy saved_homes_own_user
  on public.saved_homes
  for all
  to authenticated
  using (user_id is not null and user_id = auth.uid())
  with check (user_id is not null and user_id = auth.uid());

insert into public.interchange_discounts (
  from_operator, to_operator, from_route, to_route, window_minutes,
  discount_amount_hkd, notes_zh, notes_en, source_url, active
)
select
  'KMB', 'KMB', '960', '961', 60, null,
  '九巴 960／961 八達通轉乘優惠以公司公布及車費機為準。',
  'KMB 960/961 Octopus interchange: confirm on the bus reader.',
  'https://www.kmb.hk/tc/services/bus-bus-interchange.html',
  true
where not exists (
  select 1 from public.interchange_discounts where from_route = '960' and to_route = '961'
);

insert into public.interchange_discounts (
  from_operator, to_operator, from_route, to_route, window_minutes,
  discount_amount_hkd, notes_zh, notes_en, source_url, active
)
select
  'KMB', 'KMB', '961', '960', 60, null,
  '九巴 961／960 八達通轉乘優惠以公司公布及車費機為準。',
  'KMB 961/960 Octopus interchange: confirm on the bus reader.',
  'https://www.kmb.hk/tc/services/bus-bus-interchange.html',
  true
where not exists (
  select 1 from public.interchange_discounts where from_route = '961' and to_route = '960'
);
