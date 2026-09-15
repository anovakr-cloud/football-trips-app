// Список составов раньше был зашит здесь константой. Теперь пользователь
// сам управляет им на странице «Составы» (добавляет/переименовывает/
// удаляет/меняет порядок) — список хранится в таблице squads в базе,
// каждая страница, которой он нужен, загружает его сама (как и со
// стандартными статьями расходов).

const collator = new Intl.Collator('ru')

// Группирует список игроков (объекты с полями full_name и squad) по
// составам в порядке squadNames, внутри каждой группы — по алфавиту.
// Пустые группы не включаются.
// includeUnassigned=true — добавляет в конец отдельную группу "Без состава"
// для тех, у кого состав не указан ИЛИ у кого указан состав, которого уже
// нет в текущем списке squadNames (например, состав удалили на странице
// «Составы», а в старых поездках у игрока это название осталось) — такие
// игроки не теряются, просто попадают в общую группу "без состава".
// includeUnassigned=false — такие игроки вообще не попадают ни в одну
// группу (используется для печати/выгрузки).
export function groupBySquad(players, squadNames, { includeUnassigned = true, unassignedLabel = 'Без состава' } = {}) {
  const sortByName = (list) => [...list].sort((a, b) => collator.compare(a.full_name, b.full_name))
  const activeNames = new Set(squadNames)

  const groups = squadNames
    .map((sq) => ({
      name: sq,
      players: sortByName(players.filter((p) => p.squad === sq)),
    }))
    .filter((g) => g.players.length > 0)

  if (includeUnassigned) {
    const rest = sortByName(players.filter((p) => !p.squad || !activeNames.has(p.squad)))
    if (rest.length > 0) groups.push({ name: unassignedLabel, players: rest })
  }

  return groups
}
