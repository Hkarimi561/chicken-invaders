-- Chicken Blasters schema (PostgreSQL / Supabase). Safe to run more than once.
-- Run it in the Supabase SQL editor, or with `npm run db:migrate` (needs DATABASE_URL).

create extension if not exists pgcrypto;

create table if not exists users (
  id            uuid primary key default gen_random_uuid(),
  username      text not null,
  username_key  text not null unique,           -- lower-case copy: names are unique ignoring case
  password_hash text not null,
  created_at    timestamptz not null default now()
);

-- One JSON document per user: keys, shop unlocks, records, achievements, weekly/season progress.
create table if not exists profiles (
  user_id    uuid primary key references users(id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

-- Browser-simulated runs (solo/daily/rush): issued at the start, closed at the end, so scores can be sanity-checked.
create table if not exists runs (
  run_id     text primary key,
  user_id    uuid not null references users(id) on delete cascade,
  kind       text not null,
  mut        jsonb not null default '[]',
  daily      jsonb,
  done       boolean not null default false,
  started_at timestamptz not null default now()
);
create index if not exists runs_started_idx on runs (started_at);

-- Community resource packs.
create table if not exists gallery_packs (
  id         text primary key,
  owner_id   uuid not null references users(id) on delete cascade,
  author     text not null,
  name       text not null,
  descr      text not null default '',
  size       integer not null,
  thumb      text,
  downloads  integer not null default 0,
  reports    jsonb not null default '[]',
  pack       jsonb not null,
  created_at bigint not null
);
create index if not exists gallery_created_idx on gallery_packs (created_at desc);

-- Login/register throttling.
create table if not exists auth_attempts (
  id  bigserial primary key,
  key text not null,
  at  timestamptz not null default now()
);
create index if not exists auth_attempts_key_idx on auth_attempts (key, at);

-- The game talks to Postgres directly with the server-side connection string. Turning on row level security with
-- no policies keeps these tables closed to Supabase's public (anon/authenticated) REST API.
alter table users          enable row level security;
alter table profiles       enable row level security;
alter table runs           enable row level security;
alter table gallery_packs  enable row level security;
alter table auth_attempts  enable row level security;
