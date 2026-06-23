-- Family Flight Tracker - Supabase setup
-- Run this once in Supabase > SQL Editor > New query > Run.
-- This version is designed for a simple public GitHub Pages site.
-- It allows anonymous read/write access to the flights table so the website can work without login.
-- Do not use this for sensitive private data.

create extension if not exists pgcrypto;

create table if not exists public.flights (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,

  traveller text not null check (traveller in ('Daniel', 'Lidia', 'David', 'Alvaro')),
  flight_number integer,

  origin_code text not null,
  destination_code text not null,
  origin_name text,
  destination_name text,
  origin_country text,
  destination_country text,
  origin_continent text,
  destination_continent text,

  airline text not null,
  seat_class text not null check (seat_class in ('Economy', 'Economy Plus', 'Business', 'First')),
  purpose text not null check (purpose in ('Personal', 'Business')),

  distance_km integer not null check (distance_km >= 0),
  duration_minutes integer not null check (duration_minutes >= 0),
  route_type text not null default 'Other',
  source text default 'manual',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists flights_traveller_idx on public.flights (traveller);
create index if not exists flights_route_idx on public.flights (origin_code, destination_code);
create index if not exists flights_airline_idx on public.flights (airline);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_flights_updated_at on public.flights;
create trigger set_flights_updated_at
before update on public.flights
for each row
execute function public.set_updated_at();

alter table public.flights enable row level security;

drop policy if exists "public can read flights" on public.flights;
drop policy if exists "public can insert flights" on public.flights;
drop policy if exists "public can update flights" on public.flights;
drop policy if exists "public can delete flights" on public.flights;

create policy "public can read flights"
on public.flights
for select
to anon
using (true);

create policy "public can insert flights"
on public.flights
for insert
to anon
with check (true);

create policy "public can update flights"
on public.flights
for update
to anon
using (true)
with check (true);

create policy "public can delete flights"
on public.flights
for delete
to anon
using (true);

grant usage on schema public to anon;
grant select, insert, update, delete on public.flights to anon;
