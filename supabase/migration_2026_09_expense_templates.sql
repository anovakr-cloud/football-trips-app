-- Стандартный набор статей расходов — редактируемый список (страница
-- «Стандартные статьи»), из которого можно отметить нужные галочками при
-- создании новой поездки. На уже существующие поездки не влияет.

create table if not exists expense_column_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'manual' check (kind in ('computed', 'manual')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table expense_column_templates enable row level security;
drop policy if exists "authenticated only - expense_column_templates" on expense_column_templates;
create policy "authenticated only - expense_column_templates" on expense_column_templates
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

grant usage on schema public to authenticated;
grant select, insert, update, delete on
  roster_players, trips, trip_players, expense_columns,
  expense_participants, expense_values, payments, cash_ledger,
  expense_column_templates
to authenticated;

-- Заполняем стандартный набор один раз — только если таблица ещё пустая
-- (чтобы повторный запуск миграции не плодил дубликаты и не затирал то,
-- что ты уже сам поменял на странице «Стандартные статьи»).
insert into expense_column_templates (name, kind, sort_order)
select * from (values
  ('Питание', 'manual', 0),
  ('Проживание', 'manual', 1),
  ('Дорога туда', 'manual', 2),
  ('Дорога обратно', 'manual', 3),
  ('Тренер проживание/питание', 'computed', 4),
  ('Трансфер туда', 'manual', 5),
  ('Трансфер обратно', 'manual', 6),
  ('Тренерские', 'manual', 7)
) as seed(name, kind, sort_order)
where not exists (select 1 from expense_column_templates);
