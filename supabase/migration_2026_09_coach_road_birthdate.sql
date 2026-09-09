-- Миграция для УЖЕ РАЗВЁРНУТОЙ базы (приложение уже работает на Vercel).
-- Просто добавляет новые столбцы, ничего не удаляет и не трогает
-- существующие данные/политики доступа. Безопасно выполнять один раз.
--
-- Как применить: Supabase -> SQL Editor -> New query -> вставить целиком -> Run.
-- (schema.sql тоже обновлён этими же полями — он нужен только для НОВОЙ,
-- ещё не созданной базы; на уже существующую его повторно накатывать не
-- нужно, там из-за "create policy" будет ошибка "policy already exists".)

alter table trips add column if not exists road_total numeric(10,2) not null default 0;
alter table trips add column if not exists coach_costs_total numeric(10,2) not null default 0;
alter table trips add column if not exists coach_fee_total numeric(10,2) not null default 0;

alter table players add column if not exists birth_date date;
