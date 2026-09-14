-- Схема базы данных для приложения расчёта затрат на поездки футболистов
-- Выполнить этот файл целиком в Supabase: SQL Editor -> New query -> Run
--
-- Модель (версия 2, гибкие статьи расходов):
--   roster_players   — постоянный состав команды (игрок существует независимо
--                       от поездок, чтобы можно было видеть его баланс за весь сезон)
--   trips            — поездки/турниры (без фиксированных тарифов — тарифов
--                       больше нет, вместо них произвольные статьи расходов)
--   trip_players     — какие игроки из ростера участвуют в конкретной поездке
--                       (даты приезда/отъезда — только для справки, ни на что
--                       автоматически не влияют)
--   expense_columns  — статьи расходов конкретной поездки, двух видов:
--                       'computed' — общая сумма делится поровну между
--                                    отмеченными участниками (expense_participants)
--                       'manual'   — значение вписывается вручную по каждому
--                                    игроку (expense_values)
--   expense_participants — кто участвует в конкретной computed-статье
--   expense_values   — значения по игрокам для manual-статей
--   payments         — платежи игрока по конкретной поездке, по датам

create extension if not exists "pgcrypto";

-- Постоянный состав (ростер) — существует независимо от поездок
create table if not exists roster_players (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  notes text,
  created_at timestamptz not null default now()
);

-- Поездки / турниры
create table if not exists trips (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date not null,
  end_date date not null,
  notes text,
  created_at timestamptz not null default now()
);

-- Игроки, участвующие в конкретной поездке (связь ростер <-> поездка)
create table if not exists trip_players (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  player_id uuid not null references roster_players(id) on delete cascade,
  arrival_date date,     -- справочно, только чтобы помнить, кто когда приехал
  departure_date date,   -- справочно, только чтобы помнить, кто когда уехал
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (trip_id, player_id)
);

create index if not exists idx_trip_players_trip_id on trip_players(trip_id);
create index if not exists idx_trip_players_player_id on trip_players(player_id);

-- Статьи расходов поездки (полностью произвольные, задаются вручную)
create table if not exists expense_columns (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  name text not null,
  kind text not null default 'computed' check (kind in ('computed', 'manual')),
  item_date date,                 -- опционально, для справки (на какую дату статья)
  total_amount numeric(10,2),     -- только для kind='computed' — общая сумма, делится на отмеченных
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_expense_columns_trip_id on expense_columns(trip_id);

-- Кто участвует в конкретной computed-статье (сумма делится только между ними)
create table if not exists expense_participants (
  column_id uuid not null references expense_columns(id) on delete cascade,
  trip_player_id uuid not null references trip_players(id) on delete cascade,
  primary key (column_id, trip_player_id)
);

-- Значения по игрокам для manual-статей (вписываются вручную)
create table if not exists expense_values (
  column_id uuid not null references expense_columns(id) on delete cascade,
  trip_player_id uuid not null references trip_players(id) on delete cascade,
  amount numeric(10,2) not null default 0,
  primary key (column_id, trip_player_id)
);

-- Платежи игрока по конкретной поездке (история по датам)
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  trip_player_id uuid not null references trip_players(id) on delete cascade,
  amount numeric(10,2) not null,
  paid_at date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_payments_trip_player_id on payments(trip_player_id);

-- Включаем Row Level Security и разрешаем доступ только авторизованным
-- пользователям Supabase Auth (см. README — как создать свой логин/пароль).
-- Это настоящая защита на уровне базы, а не просто экран с паролем во фронтенде:
-- без входа в систему API базы не отдаст и не примет данные.
alter table roster_players enable row level security;
alter table trips enable row level security;
alter table trip_players enable row level security;
alter table expense_columns enable row level security;
alter table expense_participants enable row level security;
alter table expense_values enable row level security;
alter table payments enable row level security;

create policy "authenticated only - roster_players" on roster_players
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated only - trips" on trips
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated only - trip_players" on trip_players
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated only - expense_columns" on expense_columns
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated only - expense_participants" on expense_participants
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated only - expense_values" on expense_values
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated only - payments" on payments
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
