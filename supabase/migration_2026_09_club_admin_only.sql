-- Управление СПИСКОМ КЛУБОВ (создание нового клуба, переименование, смена
-- логотипа, удаление) — только через один аккаунт-администратор. Все
-- остальные, кого администратор добавляет в club_members, как и раньше
-- могут свободно работать ВНУТРИ своего клуба — игроки, поездки, статьи
-- расходов, составы, касса — эта миграция ничего не меняет в правах на
-- данные клуба, только в правах на сам клуб (его запись в списке клубов).
-- Выполнить этот файл целиком в Supabase: SQL Editor -> New query -> Run.
-- Идемпотентно — можно запускать повторно.

create table if not exists app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table app_admins enable row level security;

-- Список администраторов виден любому авторизованному — это просто список
-- служебных UUID (без email/имён), ничего личного не раскрывает. Открытое
-- чтение нужно и чтобы приложение могло проверить "я админ?", и чтобы
-- корректно работала проверка "администратора ещё вообще нет" при самой
-- первой установке (ниже).
drop policy if exists "read app_admins" on app_admins;
create policy "read app_admins" on app_admins
  for select using (auth.role() = 'authenticated');

-- Записать себя в администраторы можно только пока список пуст — это
-- ровно ситуация самой первой установки приложения, когда администратора
-- ещё ни у кого нет. Как только первый администратор появился (вручную
-- ниже, или через этот же механизм на свежей установке) — записать сюда
-- кого-то ещё можно только вручную через Table Editor в Supabase (минуя
-- эту защиту), сознательно, чтобы никто не мог сам себя назначить.
drop policy if exists "bootstrap first admin" on app_admins;
create policy "bootstrap first admin" on app_admins
  for insert with check (not exists (select 1 from app_admins));

grant usage on schema public to authenticated;
grant select, insert on app_admins to authenticated;

-- Единственный администратор клубов — этот аккаунт (тот же логин, которым
-- пользуешься в самом приложении). Если понадобится поменять/добавить
-- администратора позже — правится вручную в Table Editor -> app_admins.
insert into app_admins (user_id)
select id from auth.users where email = 'anovakr@gmail.com'
on conflict (user_id) do nothing;

drop policy if exists "insert clubs" on clubs;
create policy "insert clubs" on clubs
  for insert with check (
    exists (select 1 from app_admins where user_id = auth.uid())
    or not exists (select 1 from app_admins)
  );

drop policy if exists "update own clubs" on clubs;
create policy "update own clubs" on clubs
  for update using (exists (select 1 from app_admins where user_id = auth.uid()))
  with check (exists (select 1 from app_admins where user_id = auth.uid()));

drop policy if exists "delete own clubs" on clubs;
create policy "delete own clubs" on clubs
  for delete using (exists (select 1 from app_admins where user_id = auth.uid()));
