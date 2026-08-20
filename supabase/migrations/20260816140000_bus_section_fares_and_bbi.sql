-- Official Transport Department 分段收費 (on-stop → off-stop matrix) plus
-- KMB / Citybus published Octopus interchange discounts.
-- Apply in the TransitBuddy SQL editor, then: npm run import-bus-fares
-- Readable with the anon / publishable key. Writes use SUPABASE_SECRET_KEY.

create table if not exists public.bus_fare_routes (
  route_id integer not null,
  route_seq smallint not null,
  company_code text not null,
  route_name text not null,
  route_name_en text,
  bound text,
  orig_zh text,
  orig_en text,
  dest_zh text,
  dest_en text,
  journey_time_minutes integer,
  full_fare_hkd numeric(6,1),
  stop_count integer,
  section_prices numeric(6,1)[],
  -- packed triangle: section_fares[on_seq-1][off_seq-on_seq-1] = HKD
  section_fares jsonb not null default '[]'::jsonb,
  source text not null default 'td-xml',
  updated_at timestamptz not null default now(),
  primary key (route_id, route_seq)
);

create index if not exists bus_fare_routes_name_idx
  on public.bus_fare_routes (company_code, route_name);

alter table public.bus_fare_routes enable row level security;

drop policy if exists bus_fare_routes_read on public.bus_fare_routes;
create policy bus_fare_routes_read
  on public.bus_fare_routes
  for select
  to anon, authenticated
  using (true);

create table if not exists public.bus_interchange_discounts (
  id text primary key,
  source text not null,
  from_operator text not null,
  to_operator text not null,
  from_route text not null,
  to_route text not null,
  from_bound text,
  to_bound text,
  from_dest_zh text,
  to_dest_zh text,
  interchange_zh text,
  discount_type text not null default 'other',
  discount_code text,
  discount_raw text,
  discount_amount_hkd numeric(6,1),
  child_hkd numeric(6,1),
  senior_hkd numeric(6,1),
  total_fare_hkd numeric(6,1),
  window_minutes integer,
  max_changes smallint,
  package_zh text,
  notes_zh text,
  notes_en text,
  source_url text,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create index if not exists bus_interchange_discounts_pair_idx
  on public.bus_interchange_discounts (from_route, to_route)
  where active = true;

create index if not exists bus_interchange_discounts_from_idx
  on public.bus_interchange_discounts (from_route)
  where active = true;

alter table public.bus_interchange_discounts enable row level security;

drop policy if exists bus_interchange_discounts_read on public.bus_interchange_discounts;
create policy bus_interchange_discounts_read
  on public.bus_interchange_discounts
  for select
  to anon, authenticated
  using (active = true);

comment on table public.bus_fare_routes is
  'TD FARE_BUS.xml / FARE_GMB.xml section-fare matrix, packed per route direction.';
comment on table public.bus_interchange_discounts is
  'KMB BBI_routeF1/B1.js and Citybus concessionApi scheme pages. Amounts are operator-published.';
