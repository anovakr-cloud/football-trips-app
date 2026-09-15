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
  default_squad text,    -- "состав по умолчанию", подставляется при добавлении
                          -- игрока в НОВУЮ поездку; на уже созданные не влияет
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
  squad text,            -- 'Состав 1' / 'Состав 2' / пусто — только для ЭТОЙ поездки
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

-- Касса клуба — общий учёт поступлений/расходов, не привязан к конкретной
-- поездке или составу.
create table if not exists cash_ledger (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null default current_date,
  amount numeric(10,2) not null,
  kind text not null check (kind in ('deposit', 'expense')),
  note text,
  created_at timestamptz not null default now()
);

-- Стандартный набор статей расходов — редактируемый список, из которого
-- можно отметить нужные галочками при создании новой поездки (страница
-- «Стандартные статьи»). На уже существующие поездки не влияет.
create table if not exists expense_column_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'manual' check (kind in ('computed', 'manual')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- Список составов (Состав 1, Состав 2, Сопровождающие и т.д.) — редактируемый
-- список, которым пользователь управляет сам на странице «Составы»:
-- добавляет/переименовывает/удаляет/меняет порядок. Порядок в этом списке —
-- это и порядок фильтров/блоков на экране, и в выгрузке Excel. Удаление
-- состава не трогает уже сохранённые данные игроков в старых поездках — они
-- просто перестают попадать в группировку и показываются как «Без состава».
create table if not exists squads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

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
alter table cash_ledger enable row level security;
alter table expense_column_templates enable row level security;
alter table squads enable row level security;

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
create policy "authenticated only - cash_ledger" on cash_ledger
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated only - expense_column_templates" on expense_column_templates
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated only - squads" on squads
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Права на таблицы для роли authenticated — выдаём явно (RLS-политика выше
-- разрешает доступ, но без этих прав Supabase иногда всё равно отвечает
-- "permission denied for table ..." на новых таблицах).
grant usage on schema public to authenticated;
grant select, insert, update, delete on
  roster_players,
  trips,
  trip_players,
  expense_columns,
  expense_participants,
  expense_values,
  payments,
  cash_ledger,
  expense_column_templates,
  squads
to authenticated;

-- Стандартный набор статей расходов на новую базу — те же 8, что и в
-- готовой миграции для уже существующих баз (см. README).
insert into expense_column_templates (name, kind, sort_order) values
  ('Питание', 'manual', 0),
  ('Проживание', 'manual', 1),
  ('Дорога туда', 'manual', 2),
  ('Дорога обратно', 'manual', 3),
  ('Тренер проживание/питание', 'computed', 4),
  ('Трансфер туда', 'manual', 5),
  ('Трансфер обратно', 'manual', 6),
  ('Тренерские', 'manual', 7);

-- Составы на новую базу — Состав 1 / Состав 2 / Сопровождающие; дальше
-- список можно менять на странице «Составы».
insert into squads (name, sort_order) values
  ('Состав 1', 0),
  ('Состав 2', 1),
  ('Сопровождающие', 2);
