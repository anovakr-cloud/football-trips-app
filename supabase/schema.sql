-- Схема базы данных для приложения расчёта затрат на поездки футболистов
-- Выполнить этот файл целиком в Supabase: SQL Editor -> New query -> Run

create extension if not exists "pgcrypto";

-- Поездки / турниры
create table if not exists trips (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date not null,
  end_date date not null,
  food_rate numeric(10,2) not null default 0,      -- питание, руб/чел/день
  stay_rate numeric(10,2) not null default 0,      -- проживание, руб/чел/день
  snack_rate numeric(10,2) not null default 0,     -- перекус, руб/чел/день
  notes text,
  created_at timestamptz not null default now()
);

-- Игроки в рамках конкретной поездки
create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  full_name text not null,
  travel_cost numeric(10,2) not null default 0,    -- проезд, индивидуально (льготы и т.п.)
  arrival_date date,                                -- если NULL -> берётся start_date поездки
  departure_date date,                              -- если NULL -> берётся end_date поездки (досрочный отъезд)
  adjustment numeric(10,2) not null default 0,      -- ручная корректировка (может быть отрицательной)
  adjustment_note text,                             -- пояснение к корректировке
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_players_trip_id on players(trip_id);

-- Включаем Row Level Security и разрешаем доступ только авторизованным
-- пользователям Supabase Auth (см. README — как создать свой логин/пароль).
-- Это настоящая защита на уровне базы, а не просто экран с паролем во фронтенде:
-- без входа в систему API базы не отдаст и не примет данные.
alter table trips enable row level security;
alter table players enable row level security;

create policy "authenticated only - trips" on trips
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "authenticated only - players" on players
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
