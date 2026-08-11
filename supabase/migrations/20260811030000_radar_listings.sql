create extension if not exists pgcrypto;

create table if not exists public.radar_listings (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null unique,
  source_id text not null,
  external_id text,
  source_url text not null,
  title text not null,
  description text,
  city text,
  postal_code text,
  latitude double precision,
  longitude double precision,
  distance_km numeric(8,2),
  city_population integer,
  property_type text,
  seller_type text not null default 'unknown' check (seller_type in ('private','agency','unknown')),
  asking_price numeric(14,2),
  surface_m2 numeric(10,2),
  rooms numeric(6,1),
  dpe text,
  published_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  active boolean not null default true,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.radar_price_history (
  id bigint generated always as identity primary key,
  listing_id uuid not null references public.radar_listings(id) on delete cascade,
  asking_price numeric(14,2) not null,
  observed_at timestamptz not null default now(),
  unique (listing_id, asking_price)
);

create table if not exists public.radar_collection_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running','success','partial','failed')),
  sources_attempted integer not null default 0,
  sources_succeeded integer not null default 0,
  listings_seen integer not null default 0,
  listings_new integer not null default 0,
  errors jsonb not null default '[]'::jsonb
);

create index if not exists radar_listings_last_seen_idx on public.radar_listings(last_seen_at desc);
create index if not exists radar_listings_city_idx on public.radar_listings(city);
create index if not exists radar_listings_active_idx on public.radar_listings(active, last_seen_at desc);
create index if not exists radar_price_listing_idx on public.radar_price_history(listing_id, observed_at desc);

alter table public.radar_listings enable row level security;
alter table public.radar_price_history enable row level security;
alter table public.radar_collection_runs enable row level security;

revoke all on public.radar_listings from anon, authenticated;
revoke all on public.radar_price_history from anon, authenticated;
revoke all on public.radar_collection_runs from anon, authenticated;
grant all on public.radar_listings to service_role;
grant all on public.radar_price_history to service_role;
grant all on public.radar_collection_runs to service_role;
grant usage, select on all sequences in schema public to service_role;
