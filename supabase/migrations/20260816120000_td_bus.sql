-- Transport Department bus routes/fares GeoJSON (JSON_BUS.json).
-- Readable with the anon / publishable key. Writes use SUPABASE_SECRET_KEY.

create table if not exists public.td_bus_routes (
  route_id integer not null,
  route_seq smallint not null,
  company_code text not null,
  route_name text not null,
  route_name_en text,
  service_mode text,
  special_type smallint,
  journey_time_minutes integer,
  full_fare_hkd numeric(6,1) not null,
  orig_zh text,
  orig_en text,
  dest_zh text,
  dest_en text,
  hyperlink_zh text,
  hyperlink_en text,
  last_update date,
  stop_count integer,
  bound text,
  primary key (route_id, route_seq)
);

create index if not exists td_bus_routes_name_idx
  on public.td_bus_routes (company_code, route_name);

alter table public.td_bus_routes enable row level security;

drop policy if exists td_bus_routes_read on public.td_bus_routes;
create policy td_bus_routes_read
  on public.td_bus_routes
  for select
  to anon, authenticated
  using (true);

create table if not exists public.td_bus_stops (
  route_id integer not null,
  route_seq smallint not null,
  stop_seq smallint not null,
  stop_id integer not null,
  stop_name_zh text,
  stop_name_en text,
  district text,
  pick_drop smallint,
  lng double precision,
  lat double precision,
  primary key (route_id, route_seq, stop_seq)
);

create index if not exists td_bus_stops_stop_idx
  on public.td_bus_stops (stop_id);

create index if not exists td_bus_stops_route_idx
  on public.td_bus_stops (route_id, route_seq);

alter table public.td_bus_stops enable row level security;

drop policy if exists td_bus_stops_read on public.td_bus_stops;
create policy td_bus_stops_read
  on public.td_bus_stops
  for select
  to anon, authenticated
  using (true);
