-- Миграция: составы у игроков в поездке + общая касса клуба.
-- Выполнить целиком в Supabase: SQL Editor -> New query -> Run.
-- Безопасно выполнять повторно, ничего не удаляет.

-- 1. Состав ('Состав 1' / 'Состав 2' / пусто) — атрибут участия игрока
--    в КОНКРЕТНОЙ поездке (trip_players), а не постоянная метка в общем
--    составе: один и тот же ребёнок в разных турнирах может быть в разных
--    составах.
alter table trip_players add column if not exists squad text;

-- 2. Касса клуба — общий учёт поступлений/расходов, не привязан к
--    конкретной поездке или составу.
create table if not exists cash_ledger (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null default current_date,
  amount numeric(10,2) not null,
  kind text not null check (kind in ('deposit', 'expense')),
  note text,
  created_at timestamptz not null default now()
);

alter table cash_ledger enable row level security;
drop policy if exists "authenticated only - cash_ledger" on cash_ledger;
create policy "authenticated only - cash_ledger" on cash_ledger
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- 3. Права на таблицы для роли authenticated — выдаём явно на все таблицы
--    (в прошлый раз именно отсутствие этих прав вызывало ошибку
--    "permission denied for table ..."), включая новую cash_ledger.
grant usage on schema public to authenticated;
grant select, insert, update, delete on
  roster_players,
  trips,
  trip_players,
  expense_columns,
  expense_participants,
  expense_values,
  payments,
  cash_ledger
to authenticated;
