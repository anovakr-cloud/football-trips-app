-- Мультиклубность: одно приложение обслуживает несколько футбольных клубов.
-- У каждого клуба — свой список игроков, поездок, статей расходов, составов
-- и кассы; пользователь видит только те клубы, в которых состоит
-- (club_members). Выполнить этот файл целиком в Supabase: SQL Editor ->
-- New query -> Run. Идемпотентно — можно запускать повторно, ничего не
-- удаляет и не дублирует.
--
-- Все, у кого сейчас есть логин в приложении, автоматически становятся
-- участниками первого клуба «Урал» — доступ у них не меняется ни на йоту,
-- просто теперь явно записан в club_members.
--
-- Как добавить нового человека в клуб (не через SQL, а через интерфейс
-- Supabase, вручную — как и раньше):
--   1. Authentication -> Users -> Add user (email/пароль, как обычно).
--   2. Скопировать его User UID (колонка в списке пользователей).
--   3. Table Editor -> club_members -> Insert row: user_id = скопированный
--      UID, club_id = id нужного клуба (id клуба видно в Table Editor ->
--      clubs, или в самом приложении на странице выбора клуба).
-- Создавать сами клубы после обновления можно прямо в приложении — на
-- странице выбора клуба после входа.

create table if not exists clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order integer not null default 0,
  logo_url text,
  created_at timestamptz not null default now()
);

create table if not exists club_members (
  user_id uuid not null references auth.users(id) on delete cascade,
  club_id uuid not null references clubs(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, club_id)
);

alter table clubs enable row level security;
alter table club_members enable row level security;

-- Клуб виден/редактируется только тем, кто в нём состоит. Создать новый
-- клуб может любой авторизованный (курица-яйцо: до создания членства ещё
-- нет) — сразу после создания приложение само добавляет создателя в
-- club_members, поэтому дальше он его уже видит и может редактировать.
drop policy if exists "select own clubs" on clubs;
create policy "select own clubs" on clubs
  for select using (exists (select 1 from club_members cm where cm.club_id = clubs.id and cm.user_id = auth.uid()));
drop policy if exists "insert clubs" on clubs;
create policy "insert clubs" on clubs
  for insert with check (auth.role() = 'authenticated');
drop policy if exists "update own clubs" on clubs;
create policy "update own clubs" on clubs
  for update using (exists (select 1 from club_members cm where cm.club_id = clubs.id and cm.user_id = auth.uid()))
  with check (exists (select 1 from club_members cm where cm.club_id = clubs.id and cm.user_id = auth.uid()));
drop policy if exists "delete own clubs" on clubs;
create policy "delete own clubs" on clubs
  for delete using (exists (select 1 from club_members cm where cm.club_id = clubs.id and cm.user_id = auth.uid()));

-- Свою строку членства видит только сам пользователь; добавить может только
-- себя (чтобы одна доверенная запись в интерфейсе не могла вписать себя в
-- чужой клуб) — привязку ДРУГИХ людей к клубу админ по-прежнему делает
-- вручную через Table Editor (это выполняется от имени Supabase, минуя RLS).
drop policy if exists "select own memberships" on club_members;
create policy "select own memberships" on club_members
  for select using (user_id = auth.uid());
drop policy if exists "insert own membership" on club_members;
create policy "insert own membership" on club_members
  for insert with check (user_id = auth.uid());
drop policy if exists "delete own membership" on club_members;
create policy "delete own membership" on club_members
  for delete using (user_id = auth.uid());

grant usage on schema public to authenticated;
grant select, insert, update, delete on clubs, club_members to authenticated;

-- Первый клуб — «Урал», с фиксированным id, чтобы миграцию можно было
-- запускать повторно без дублей и ссылаться на этот id ниже. Логотип —
-- уже загруженный статический файл (см. недавнее обновление с водяным
-- знаком), чтобы после миграции ничего не изменилось визуально.
insert into clubs (id, name, sort_order, logo_url)
values ('11111111-1111-1111-1111-111111111111', 'Урал', 0, '/logo-watermark.jpg')
on conflict (id) do nothing;

-- club_id в существующих таблицах верхнего уровня (у кого он свой на клуб).
-- Дочерние таблицы (trip_players, expense_columns, expense_participants,
-- expense_values, payments) club_id не хранят — их клуб определяется через
-- родителя (trip_id -> trips.club_id и т.д.), см. политики ниже.
alter table roster_players add column if not exists club_id uuid references clubs(id);
alter table trips add column if not exists club_id uuid references clubs(id);
alter table expense_column_templates add column if not exists club_id uuid references clubs(id);
alter table squads add column if not exists club_id uuid references clubs(id);
alter table cash_ledger add column if not exists club_id uuid references clubs(id);

update roster_players set club_id = '11111111-1111-1111-1111-111111111111' where club_id is null;
update trips set club_id = '11111111-1111-1111-1111-111111111111' where club_id is null;
update expense_column_templates set club_id = '11111111-1111-1111-1111-111111111111' where club_id is null;
update squads set club_id = '11111111-1111-1111-1111-111111111111' where club_id is null;
update cash_ledger set club_id = '11111111-1111-1111-1111-111111111111' where club_id is null;

alter table roster_players alter column club_id set not null;
alter table trips alter column club_id set not null;
alter table expense_column_templates alter column club_id set not null;
alter table squads alter column club_id set not null;
alter table cash_ledger alter column club_id set not null;

create index if not exists idx_roster_players_club_id on roster_players(club_id);
create index if not exists idx_trips_club_id on trips(club_id);
create index if not exists idx_expense_column_templates_club_id on expense_column_templates(club_id);
create index if not exists idx_squads_club_id on squads(club_id);
create index if not exists idx_cash_ledger_club_id on cash_ledger(club_id);

-- Все текущие пользователи становятся участниками клуба «Урал» — их доступ
-- не меняется, просто теперь явно записан.
insert into club_members (user_id, club_id)
select u.id, '11111111-1111-1111-1111-111111111111'
from auth.users u
where not exists (
  select 1 from club_members cm
  where cm.user_id = u.id and cm.club_id = '11111111-1111-1111-1111-111111111111'
);

-- Новые RLS-политики верхнеуровневых таблиц: доступ только к своему клубу.
drop policy if exists "authenticated only - roster_players" on roster_players;
drop policy if exists "own club only - roster_players" on roster_players;
create policy "own club only - roster_players" on roster_players
  for all using (exists (select 1 from club_members cm where cm.club_id = roster_players.club_id and cm.user_id = auth.uid()))
  with check (exists (select 1 from club_members cm where cm.club_id = roster_players.club_id and cm.user_id = auth.uid()));

drop policy if exists "authenticated only - trips" on trips;
drop policy if exists "own club only - trips" on trips;
create policy "own club only - trips" on trips
  for all using (exists (select 1 from club_members cm where cm.club_id = trips.club_id and cm.user_id = auth.uid()))
  with check (exists (select 1 from club_members cm where cm.club_id = trips.club_id and cm.user_id = auth.uid()));

drop policy if exists "authenticated only - expense_column_templates" on expense_column_templates;
drop policy if exists "own club only - expense_column_templates" on expense_column_templates;
create policy "own club only - expense_column_templates" on expense_column_templates
  for all using (exists (select 1 from club_members cm where cm.club_id = expense_column_templates.club_id and cm.user_id = auth.uid()))
  with check (exists (select 1 from club_members cm where cm.club_id = expense_column_templates.club_id and cm.user_id = auth.uid()));

drop policy if exists "authenticated only - squads" on squads;
drop policy if exists "own club only - squads" on squads;
create policy "own club only - squads" on squads
  for all using (exists (select 1 from club_members cm where cm.club_id = squads.club_id and cm.user_id = auth.uid()))
  with check (exists (select 1 from club_members cm where cm.club_id = squads.club_id and cm.user_id = auth.uid()));

drop policy if exists "authenticated only - cash_ledger" on cash_ledger;
drop policy if exists "own club only - cash_ledger" on cash_ledger;
create policy "own club only - cash_ledger" on cash_ledger
  for all using (exists (select 1 from club_members cm where cm.club_id = cash_ledger.club_id and cm.user_id = auth.uid()))
  with check (exists (select 1 from club_members cm where cm.club_id = cash_ledger.club_id and cm.user_id = auth.uid()));

-- Дочерние таблицы — доступ через клуб родительской поездки/статьи.
drop policy if exists "authenticated only - trip_players" on trip_players;
drop policy if exists "own club only - trip_players" on trip_players;
create policy "own club only - trip_players" on trip_players
  for all using (exists (
    select 1 from trips t join club_members cm on cm.club_id = t.club_id
    where t.id = trip_players.trip_id and cm.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from trips t join club_members cm on cm.club_id = t.club_id
    where t.id = trip_players.trip_id and cm.user_id = auth.uid()
  ));

drop policy if exists "authenticated only - expense_columns" on expense_columns;
drop policy if exists "own club only - expense_columns" on expense_columns;
create policy "own club only - expense_columns" on expense_columns
  for all using (exists (
    select 1 from trips t join club_members cm on cm.club_id = t.club_id
    where t.id = expense_columns.trip_id and cm.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from trips t join club_members cm on cm.club_id = t.club_id
    where t.id = expense_columns.trip_id and cm.user_id = auth.uid()
  ));

drop policy if exists "authenticated only - expense_participants" on expense_participants;
drop policy if exists "own club only - expense_participants" on expense_participants;
create policy "own club only - expense_participants" on expense_participants
  for all using (exists (
    select 1 from expense_columns ec
    join trips t on t.id = ec.trip_id
    join club_members cm on cm.club_id = t.club_id
    where ec.id = expense_participants.column_id and cm.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from expense_columns ec
    join trips t on t.id = ec.trip_id
    join club_members cm on cm.club_id = t.club_id
    where ec.id = expense_participants.column_id and cm.user_id = auth.uid()
  ));

drop policy if exists "authenticated only - expense_values" on expense_values;
drop policy if exists "own club only - expense_values" on expense_values;
create policy "own club only - expense_values" on expense_values
  for all using (exists (
    select 1 from expense_columns ec
    join trips t on t.id = ec.trip_id
    join club_members cm on cm.club_id = t.club_id
    where ec.id = expense_values.column_id and cm.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from expense_columns ec
    join trips t on t.id = ec.trip_id
    join club_members cm on cm.club_id = t.club_id
    where ec.id = expense_values.column_id and cm.user_id = auth.uid()
  ));

drop policy if exists "authenticated only - payments" on payments;
drop policy if exists "own club only - payments" on payments;
create policy "own club only - payments" on payments
  for all using (exists (
    select 1 from trip_players tp
    join trips t on t.id = tp.trip_id
    join club_members cm on cm.club_id = t.club_id
    where tp.id = payments.trip_player_id and cm.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from trip_players tp
    join trips t on t.id = tp.trip_id
    join club_members cm on cm.club_id = t.club_id
    where tp.id = payments.trip_player_id and cm.user_id = auth.uid()
  ));

-- Хранилище для логотипов клубов (страница выбора/управления клубами).
insert into storage.buckets (id, name, public)
values ('club-logos', 'club-logos', true)
on conflict (id) do nothing;

drop policy if exists "club logos public read" on storage.objects;
create policy "club logos public read" on storage.objects
  for select using (bucket_id = 'club-logos');

drop policy if exists "club logos authenticated write" on storage.objects;
create policy "club logos authenticated write" on storage.objects
  for all using (bucket_id = 'club-logos' and auth.role() = 'authenticated')
  with check (bucket_id = 'club-logos' and auth.role() = 'authenticated');
