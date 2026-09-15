-- Схема базы данных для приложения расчёта затрат на поездки футболистов
-- Выполнить этот файл целиком в Supabase: SQL Editor -> New query -> Run
--
-- Модель (версия 3, мультиклубность):
--   clubs            — клубы; у каждого клуба свой набор данных ниже
--   club_members     — кто из пользователей в каком клубе состоит (доступ
--                       определяется этим, а не общим фактом входа)
--   roster_players   — постоянный состав команды клуба (игрок существует
--                       независимо от поездок, чтобы видеть баланс за сезон)
--   trips            — поездки/турниры клуба (без фиксированных тарифов —
--                       вместо них произвольные статьи расходов)
--   trip_players     — какие игроки из ростера участвуют в конкретной поездке
--                       (даты приезда/отъезда — только для справки)
--   expense_columns  — статьи расходов конкретной поездки, двух видов:
--                       'computed' — общая сумма делится поровну между
--                                    отмеченными участниками (expense_participants)
--                       'manual'   — значение вписывается вручную по каждому
--                                    игроку (expense_values)
--   expense_participants — кто участвует в конкретной computed-статье
--   expense_values   — значения по игрокам для manual-статей
--   payments         — платежи игрока по конкретной поездке, по датам
--   cash_ledger      — касса клуба (общая, не привязана к поездке)
--   expense_column_templates — редактируемый стандартный набор статей клуба
--   squads           — редактируемый список составов клуба

create extension if not exists "pgcrypto";

-- Клубы — у каждого своя картинка-логотип (водяной знак на фоне) и порядок
-- отображения в списке выбора после входа.
create table if not exists clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order integer not null default 0,
  logo_url text,
  created_at timestamptz not null default now()
);

-- Кто из пользователей Supabase Auth в каком клубе состоит — этим
-- определяется доступ (см. политики ниже), а не просто фактом входа.
create table if not exists club_members (
  user_id uuid not null references auth.users(id) on delete cascade,
  club_id uuid not null references clubs(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, club_id)
);

-- Постоянный состав (ростер) клуба — существует независимо от поездок
create table if not exists roster_players (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id),
  full_name text not null,
  notes text,
  default_squad text,    -- "состав по умолчанию", подставляется при добавлении
                          -- игрока в НОВУЮ поездку; на уже созданные не влияет
  created_at timestamptz not null default now()
);

create index if not exists idx_roster_players_club_id on roster_players(club_id);

-- Поездки / турниры клуба
create table if not exists trips (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id),
  name text not null,
  start_date date not null,
  end_date date not null,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_trips_club_id on trips(club_id);

-- Игроки, участвующие в конкретной поездке (связь ростер <-> поездка).
-- club_id отдельно не хранит — клуб определяется через trip_id -> trips.
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
  club_id uuid not null references clubs(id),
  entry_date date not null default current_date,
  amount numeric(10,2) not null,
  kind text not null check (kind in ('deposit', 'expense')),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_cash_ledger_club_id on cash_ledger(club_id);

-- Стандартный набор статей расходов клуба — редактируемый список, из
-- которого можно отметить нужные галочками при создании новой поездки
-- (страница «Стандартные статьи»). На уже существующие поездки не влияет.
create table if not exists expense_column_templates (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id),
  name text not null,
  kind text not null default 'manual' check (kind in ('computed', 'manual')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_expense_column_templates_club_id on expense_column_templates(club_id);

-- Список составов клуба (Состав 1, Состав 2, Сопровождающие и т.д.) —
-- редактируемый список, которым пользователь управляет сам на странице
-- «Составы»: добавляет/переименовывает/удаляет/меняет порядок. Порядок в
-- этом списке — это и порядок фильтров/блоков на экране, и в выгрузке
-- Excel. Удаление состава не трогает уже сохранённые данные игроков в
-- старых поездках — они просто перестают попадать в группировку и
-- показываются как «Без состава».
create table if not exists squads (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id),
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_squads_club_id on squads(club_id);

-- Включаем Row Level Security. Доступ к данным клуба определяется
-- членством в club_members, а не просто фактом входа в систему — это
-- настоящая защита на уровне базы, а не просто экран с паролем во
-- фронтенде: без нужного членства API базы не отдаст и не примет данные.
alter table clubs enable row level security;
alter table club_members enable row level security;
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

-- Клуб виден/редактируется только тем, кто в нём состоит. Создать новый
-- клуб может любой авторизованный (курица-яйцо: до создания членства ещё
-- нет) — сразу после создания приложение само добавляет создателя в
-- club_members.
create policy "select own clubs" on clubs
  for select using (exists (select 1 from club_members cm where cm.club_id = clubs.id and cm.user_id = auth.uid()));
create policy "insert clubs" on clubs
  for insert with check (auth.role() = 'authenticated');
create policy "update own clubs" on clubs
  for update using (exists (select 1 from club_members cm where cm.club_id = clubs.id and cm.user_id = auth.uid()))
  with check (exists (select 1 from club_members cm where cm.club_id = clubs.id and cm.user_id = auth.uid()));
create policy "delete own clubs" on clubs
  for delete using (exists (select 1 from club_members cm where cm.club_id = clubs.id and cm.user_id = auth.uid()));

-- Свою строку членства видит только сам пользователь; добавить может
-- только себя. Привязку ДРУГИХ людей к клубу администратор делает вручную
-- через Table Editor в Supabase (это выполняется от имени Supabase, минуя
-- RLS) — см. README, раздел про добавление людей в клуб.
create policy "select own memberships" on club_members
  for select using (user_id = auth.uid());
create policy "insert own membership" on club_members
  for insert with check (user_id = auth.uid());
create policy "delete own membership" on club_members
  for delete using (user_id = auth.uid());

create policy "own club only - roster_players" on roster_players
  for all using (exists (select 1 from club_members cm where cm.club_id = roster_players.club_id and cm.user_id = auth.uid()))
  with check (exists (select 1 from club_members cm where cm.club_id = roster_players.club_id and cm.user_id = auth.uid()));

create policy "own club only - trips" on trips
  for all using (exists (select 1 from club_members cm where cm.club_id = trips.club_id and cm.user_id = auth.uid()))
  with check (exists (select 1 from club_members cm where cm.club_id = trips.club_id and cm.user_id = auth.uid()));

create policy "own club only - trip_players" on trip_players
  for all using (exists (
    select 1 from trips t join club_members cm on cm.club_id = t.club_id
    where t.id = trip_players.trip_id and cm.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from trips t join club_members cm on cm.club_id = t.club_id
    where t.id = trip_players.trip_id and cm.user_id = auth.uid()
  ));

create policy "own club only - expense_columns" on expense_columns
  for all using (exists (
    select 1 from trips t join club_members cm on cm.club_id = t.club_id
    where t.id = expense_columns.trip_id and cm.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from trips t join club_members cm on cm.club_id = t.club_id
    where t.id = expense_columns.trip_id and cm.user_id = auth.uid()
  ));

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

create policy "own club only - cash_ledger" on cash_ledger
  for all using (exists (select 1 from club_members cm where cm.club_id = cash_ledger.club_id and cm.user_id = auth.uid()))
  with check (exists (select 1 from club_members cm where cm.club_id = cash_ledger.club_id and cm.user_id = auth.uid()));

create policy "own club only - expense_column_templates" on expense_column_templates
  for all using (exists (select 1 from club_members cm where cm.club_id = expense_column_templates.club_id and cm.user_id = auth.uid()))
  with check (exists (select 1 from club_members cm where cm.club_id = expense_column_templates.club_id and cm.user_id = auth.uid()));

create policy "own club only - squads" on squads
  for all using (exists (select 1 from club_members cm where cm.club_id = squads.club_id and cm.user_id = auth.uid()))
  with check (exists (select 1 from club_members cm where cm.club_id = squads.club_id and cm.user_id = auth.uid()));

-- Права на таблицы для роли authenticated — выдаём явно (RLS-политика выше
-- разрешает доступ, но без этих прав Supabase иногда всё равно отвечает
-- "permission denied for table ..." на новых таблицах).
grant usage on schema public to authenticated;
grant select, insert, update, delete on
  clubs,
  club_members,
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

-- Хранилище для логотипов клубов (страница выбора/управления клубами).
insert into storage.buckets (id, name, public)
values ('club-logos', 'club-logos', true)
on conflict (id) do nothing;

create policy "club logos public read" on storage.objects
  for select using (bucket_id = 'club-logos');

create policy "club logos authenticated write" on storage.objects
  for all using (bucket_id = 'club-logos' and auth.role() = 'authenticated')
  with check (bucket_id = 'club-logos' and auth.role() = 'authenticated');

-- Клубов на новую базу намеренно не заводим здесь: после первого входа в
-- приложение (см. README, шаг 1, пункт 5) ты попадёшь на страницу «Клубы»
-- с пустым списком — там же прямо в интерфейсе создаёшь свой первый клуб
-- («Создать клуб»), и он сразу станет твоим (со стандартным набором статей
-- расходов и составами по умолчанию) — без лишней ручной правки в Supabase.
