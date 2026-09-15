-- Добавляет "состав по умолчанию" у игрока в общем составе (ростере).
-- Используется только для автозаполнения при добавлении игрока в НОВУЮ
-- поездку — на уже созданные поездки никак не влияет.
-- Ничего существующего не удаляет и не меняет.

alter table roster_players add column if not exists default_squad text;

grant usage on schema public to authenticated;
grant select, insert, update, delete on
  roster_players, trips, trip_players, expense_columns,
  expense_participants, expense_values, payments, cash_ledger
to authenticated;
