-- ============================================================================
-- Миграция на гибкие статьи расходов + сквозной ростер игроков (версия 2)
-- ============================================================================
--
-- ЧТО ДЕЛАЕТ: создаёт новые таблицы (roster_players, trip_players,
-- expense_columns, expense_participants, expense_values, payments) и
-- переносит в них текущие данные:
--   - каждый уникальный игрок (по ФИО, без учёта регистра/пробелов) становится
--     одной записью в roster_players — это то, что даёт "сквозную карточку"
--     игрока по всем поездкам;
--   - связь игрок-поездка переносится в trip_players (даты приезда/отъезда
--     сохраняются, но дальше они уже ни на что не влияют автоматически);
--   - то, что раньше считалось по тарифам (питание/проживание/перекус/
--     расходы на тренера/тренерские услуги/проезд/корректировка), один раз
--     СЧИТАЕТСЯ по старой формуле и ЗАМОРАЖИВАЕТСЯ как обычные ручные статьи
--     расходов — то есть эти поездки не пересчитываются на лету по-новому,
--     а просто хранят уже готовые итоговые цифры, ровно как ты их видел на
--     сайте раньше.
--
-- ВАЖНО, ЧТО НЕ ДЕЛАЕТ: НЕ трогает и НЕ удаляет старые таблицы trips/players
-- и старые столбцы (food_rate, stay_rate, road_total и т.п.) — они просто
-- перестают использоваться новым интерфейсом и остаются как есть, на всякий
-- случай. Если что-то показалось не так после миграции — старые данные
-- никуда не делись, можно свериться или переделать.
--
-- ОГРАНИЧЕНИЯ ЭТОЙ МИГРАЦИИ (на что обратить внимание после запуска):
--   1. Совпадение игрока между поездками определяется ТОЛЬКО по точному
--      совпадению ФИО (без учёта регистра и лишних пробелов). Если один и
--      тот же ребёнок записан по-разному в разных поездках (опечатка,
--      сокращение) — в ростере он попадёт как два разных игрока. Поправить
--      можно будет вручную позже.
--   2. Комментарий к корректировке (adjustment_note) не переносится — только
--      сама сумма.
--   3. После запуска ОБЯЗАТЕЛЬНО зайди в старые поездки в приложении (после
--      обновления кода) и сверь пару игроков с тем, что было на сайте до
--      этого — суммы должны совпасть. Если что-то разошлось — напиши, не
--      трогай эти поездки руками до проверки.
--
-- Как применить: Supabase -> SQL Editor -> New query -> вставить целиком -> Run.
-- Безопасно запускать повторно — уже перенесённые поездки пропускаются.
-- ============================================================================

begin;

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. Новые таблицы (см. schema.sql для описания модели)
-- ----------------------------------------------------------------------------

create table if not exists roster_players (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists trip_players (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  player_id uuid not null references roster_players(id) on delete cascade,
  arrival_date date,
  departure_date date,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (trip_id, player_id)
);

create index if not exists idx_trip_players_trip_id on trip_players(trip_id);
create index if not exists idx_trip_players_player_id on trip_players(player_id);

create table if not exists expense_columns (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  name text not null,
  kind text not null default 'computed' check (kind in ('computed', 'manual')),
  item_date date,
  total_amount numeric(10,2),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_expense_columns_trip_id on expense_columns(trip_id);

create table if not exists expense_participants (
  column_id uuid not null references expense_columns(id) on delete cascade,
  trip_player_id uuid not null references trip_players(id) on delete cascade,
  primary key (column_id, trip_player_id)
);

create table if not exists expense_values (
  column_id uuid not null references expense_columns(id) on delete cascade,
  trip_player_id uuid not null references trip_players(id) on delete cascade,
  amount numeric(10,2) not null default 0,
  primary key (column_id, trip_player_id)
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  trip_player_id uuid not null references trip_players(id) on delete cascade,
  amount numeric(10,2) not null,
  paid_at date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_payments_trip_player_id on payments(trip_player_id);

alter table roster_players enable row level security;
alter table trip_players enable row level security;
alter table expense_columns enable row level security;
alter table expense_participants enable row level security;
alter table expense_values enable row level security;
alter table payments enable row level security;

drop policy if exists "authenticated only - roster_players" on roster_players;
create policy "authenticated only - roster_players" on roster_players
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated only - trip_players" on trip_players;
create policy "authenticated only - trip_players" on trip_players
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated only - expense_columns" on expense_columns;
create policy "authenticated only - expense_columns" on expense_columns
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated only - expense_participants" on expense_participants;
create policy "authenticated only - expense_participants" on expense_participants
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated only - expense_values" on expense_values;
create policy "authenticated only - expense_values" on expense_values
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated only - payments" on payments;
create policy "authenticated only - payments" on payments
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ----------------------------------------------------------------------------
-- 2. Перенос игроков: ростер + связь с поездками (безопасно для повторного
--    запуска — уже перенесённых игроков не дублирует)
-- ----------------------------------------------------------------------------

insert into roster_players (full_name)
select distinct on (lower(trim(p.full_name))) p.full_name
from players p
where not exists (
  select 1 from roster_players rp where lower(trim(rp.full_name)) = lower(trim(p.full_name))
)
order by lower(trim(p.full_name)), p.created_at;

insert into trip_players (trip_id, player_id, arrival_date, departure_date, sort_order)
select p.trip_id, rp.id, p.arrival_date, p.departure_date, p.sort_order
from players p
join roster_players rp on lower(trim(rp.full_name)) = lower(trim(p.full_name))
where not exists (
  select 1 from trip_players tp where tp.trip_id = p.trip_id and tp.player_id = rp.id
);

-- ----------------------------------------------------------------------------
-- 3. Заморозка старых расчётов в виде обычных ручных статей
-- ----------------------------------------------------------------------------

-- Соответствие: старый players.id -> новый trip_players.id
create temporary table _player_map as
select p.id as old_player_id, tp.id as new_trip_player_id, p.trip_id
from players p
join roster_players rp on lower(trim(rp.full_name)) = lower(trim(p.full_name))
join trip_players tp on tp.trip_id = p.trip_id and tp.player_id = rp.id;

-- Дневная раскидка питания/проживания/перекуса по старой формуле
-- (тариф x изначальное число игроков / фактически присутствующих в этот день)
create temporary table _food_stay_snack as
with trip_n as (
  select trip_id, count(*) as n from players group by trip_id
),
trip_days as (
  select t.id as trip_id, gs::date as day
  from trips t
  cross join lateral generate_series(t.start_date::timestamp, t.end_date::timestamp, interval '1 day') as gs
),
presence as (
  select
    td.trip_id,
    p.id as player_id,
    td.day,
    (td.day >= coalesce(p.arrival_date, t.start_date)
     and td.day <= coalesce(p.departure_date, t.end_date)) as is_present
  from trip_days td
  join trips t on t.id = td.trip_id
  join players p on p.trip_id = td.trip_id
),
day_present_count as (
  select trip_id, day, count(*) filter (where is_present) as present_count
  from presence
  group by trip_id, day
)
select
  pr.trip_id,
  pr.player_id,
  sum(case when pr.is_present and dpc.present_count > 0
           then (t.food_rate * tn.n) / dpc.present_count else 0 end) as food_raw,
  sum(case when pr.is_present and dpc.present_count > 0
           then (t.stay_rate * tn.n) / dpc.present_count else 0 end) as stay_raw,
  sum(case when pr.is_present and dpc.present_count > 0
           then (t.snack_rate * tn.n) / dpc.present_count else 0 end) as snack_raw
from presence pr
join trips t on t.id = pr.trip_id
join trip_n tn on tn.trip_id = pr.trip_id
join day_present_count dpc on dpc.trip_id = pr.trip_id and dpc.day = pr.day
group by pr.trip_id, pr.player_id;

-- Сама заморозка: по одной manual-статье на категорию на поездку (только
-- если в категории вообще было что-то не нулевое), значения — по игрокам
do $$
declare
  trip_row record;
  col_id uuid;
  trip_n_val int;
begin
  for trip_row in select * from trips loop
    -- Поездки, где статьи уже созданы (в т.ч. этой миграцией ранее), пропускаем
    if exists (select 1 from expense_columns where trip_id = trip_row.id) then
      continue;
    end if;

    select count(*) into trip_n_val from players where trip_id = trip_row.id;
    if trip_n_val = 0 then
      continue;
    end if;

    -- Питание
    if coalesce(trip_row.food_rate, 0) <> 0 then
      insert into expense_columns (trip_id, name, kind, sort_order)
      values (trip_row.id, 'Питание (перенесено)', 'manual', 1)
      returning id into col_id;
      insert into expense_values (column_id, trip_player_id, amount)
      select col_id, m.new_trip_player_id, ceil(coalesce(fss.food_raw, 0))
      from _player_map m
      left join _food_stay_snack fss on fss.trip_id = m.trip_id and fss.player_id = m.old_player_id
      where m.trip_id = trip_row.id;
    end if;

    -- Проживание
    if coalesce(trip_row.stay_rate, 0) <> 0 then
      insert into expense_columns (trip_id, name, kind, sort_order)
      values (trip_row.id, 'Проживание (перенесено)', 'manual', 2)
      returning id into col_id;
      insert into expense_values (column_id, trip_player_id, amount)
      select col_id, m.new_trip_player_id, ceil(coalesce(fss.stay_raw, 0))
      from _player_map m
      left join _food_stay_snack fss on fss.trip_id = m.trip_id and fss.player_id = m.old_player_id
      where m.trip_id = trip_row.id;
    end if;

    -- Перекус
    if coalesce(trip_row.snack_rate, 0) <> 0 then
      insert into expense_columns (trip_id, name, kind, sort_order)
      values (trip_row.id, 'Перекус (перенесено)', 'manual', 3)
      returning id into col_id;
      insert into expense_values (column_id, trip_player_id, amount)
      select col_id, m.new_trip_player_id, ceil(coalesce(fss.snack_raw, 0))
      from _player_map m
      left join _food_stay_snack fss on fss.trip_id = m.trip_id and fss.player_id = m.old_player_id
      where m.trip_id = trip_row.id;
    end if;

    -- Проезд (индивидуальное поле travel_cost)
    if exists (select 1 from players where trip_id = trip_row.id and coalesce(travel_cost, 0) <> 0) then
      insert into expense_columns (trip_id, name, kind, sort_order)
      values (trip_row.id, 'Проезд (перенесено)', 'manual', 4)
      returning id into col_id;
      insert into expense_values (column_id, trip_player_id, amount)
      select col_id, m.new_trip_player_id, ceil(coalesce(p.travel_cost, 0))
      from _player_map m
      join players p on p.id = m.old_player_id
      where m.trip_id = trip_row.id;
    end if;

    -- Расходы на тренера (общая сумма, поровну на всех игроков поездки)
    if coalesce(trip_row.coach_costs_total, 0) <> 0 then
      insert into expense_columns (trip_id, name, kind, sort_order)
      values (trip_row.id, 'Расходы на тренера (перенесено)', 'manual', 5)
      returning id into col_id;
      insert into expense_values (column_id, trip_player_id, amount)
      select col_id, m.new_trip_player_id, ceil(trip_row.coach_costs_total / trip_n_val)
      from _player_map m
      where m.trip_id = trip_row.id;
    end if;

    -- Тренерские услуги (общая сумма, поровну на всех игроков поездки)
    if coalesce(trip_row.coach_fee_total, 0) <> 0 then
      insert into expense_columns (trip_id, name, kind, sort_order)
      values (trip_row.id, 'Тренерские услуги (перенесено)', 'manual', 6)
      returning id into col_id;
      insert into expense_values (column_id, trip_player_id, amount)
      select col_id, m.new_trip_player_id, ceil(trip_row.coach_fee_total / trip_n_val)
      from _player_map m
      where m.trip_id = trip_row.id;
    end if;

    -- Корректировка (индивидуальное поле adjustment; может быть отрицательным)
    if exists (select 1 from players where trip_id = trip_row.id and coalesce(adjustment, 0) <> 0) then
      insert into expense_columns (trip_id, name, kind, sort_order)
      values (trip_row.id, 'Корректировка (перенесено)', 'manual', 7)
      returning id into col_id;
      insert into expense_values (column_id, trip_player_id, amount)
      select col_id, m.new_trip_player_id, ceil(coalesce(p.adjustment, 0))
      from _player_map m
      join players p on p.id = m.old_player_id
      where m.trip_id = trip_row.id;
    end if;

  end loop;
end $$;

commit;
