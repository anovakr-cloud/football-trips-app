// Общий список составов — используется и в общем составе игроков (как
// "основной" состав по умолчанию), и в конкретной поездке (можно
// переопределить только для неё).
// "Сопровождающие" — отдельная группа для взрослых (родителей), которые
// периодически ездят на турниры вместе с детьми: ведутся в том же общем
// списке, но помечаются этим составом и считаются отдельно от Состав 1/2.
// Порядок в этом списке — это и порядок вывода блоков на экране/в Excel,
// поэтому "Сопровождающие" всегда последние.
export const SQUADS = ['Состав 1', 'Состав 2', 'Сопровождающие']

const collator = new Intl.Collator('ru')

// Группирует список игроков (объекты с полями full_name и squad) по составам
// в порядке SQUADS (сопровождающие — последними), внутри каждой группы —
// по алфавиту. Пустые группы не включаются.
// includeUnassigned=true — добавляет в конец отдельную группу "Без состава"
// для тех, у кого состав не указан; false — такие игроки просто не попадают
// ни в одну группу (используется для печати/выгрузки).
export function groupBySquad(players, { includeUnassigned = true, unassignedLabel = 'Без состава' } = {}) {
  const sortByName = (list) => [...list].sort((a, b) => collator.compare(a.full_name, b.full_name))

  const groups = SQUADS.map((sq) => ({
    name: sq,
    players: sortByName(players.filter((p) => p.squad === sq)),
  })).filter((g) => g.players.length > 0)

  if (includeUnassigned) {
    const rest = sortByName(players.filter((p) => !p.squad))
    if (rest.length > 0) groups.push({ name: unassignedLabel, players: rest })
  }

  return groups
}
