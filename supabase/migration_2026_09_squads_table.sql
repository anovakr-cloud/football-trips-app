-- Список составов раньше был зашит в коде (Состав 1 / Состав 2 /
-- Сопровождающие). Команда выросла (11х11, 45+ игроков) и составов
-- понадобилось больше — переносим список в таблицу, чтобы можно было
-- самому добавлять/переименовывать/удалять/менять порядок составов на
-- странице «Составы», без правки кода.
--
-- Существующие данные не трогаем: squad у trip_players и default_squad у
-- roster_players как были текстом "Состав 1"/"Состав 2"/"Сопровождающие",
-- так и остаются — сидируем таблицу squads этими же тремя названиями в
-- том же порядке, поэтому после миграции всё выглядит точно так же, как
-- было. Удаление состава из списка тоже не трогает уже сохранённые данные
-- игроков (как и с шаблонами статей) — такие игроки просто перестают
-- попадать в группировку по составу и показываются как «Без состава».

create table if not exists squads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table squads enable row level security;
drop policy if exists "authenticated only - squads" on squads;
create policy "authenticated only - squads" on squads
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

grant usage on schema public to authenticated;
grant select, insert, update, delete on squads to authenticated;

insert into squads (name, sort_order)
select * from (values
  ('Состав 1', 0),
  ('Состав 2', 1),
  ('Сопровождающие', 2)
) as seed(name, sort_order)
where not exists (select 1 from squads);
