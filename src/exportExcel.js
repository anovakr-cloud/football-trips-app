import * as XLSX from 'xlsx'
import { groupBySquad } from './squads'

function playerRow(p, n, expenseColumns) {
  return [n, p.full_name, ...expenseColumns.map((c) => p.byColumn[c.id] ?? 0), p.total, p.paid, p.debt, p.overpaid]
}

function totalsRow(label, players, expenseColumns) {
  const byColumn = {}
  for (const col of expenseColumns) byColumn[col.id] = 0
  let total = 0
  let paid = 0
  let debt = 0
  let overpaid = 0
  for (const p of players) {
    for (const col of expenseColumns) byColumn[col.id] += p.byColumn[col.id] ?? 0
    total += p.total
    paid += p.paid
    debt += p.debt
    overpaid += p.overpaid
  }
  return [label, '', ...expenseColumns.map((c) => byColumn[c.id] ?? 0), total, paid, debt, overpaid]
}

// Выгружает таблицу поездки (статьи расходов + итоги) в .xlsx.
// Если у кого-то из игроков указан состав — выгрузка делится на блоки по
// составам (в том порядке, что задан на странице «Составы»), внутри блока —
// по алфавиту, со своей нумерацией с 1; игроки без состава в этом случае в
// выгрузку не попадают. Если состав не указан вообще ни у кого — выгружается
// как раньше, единым списком по алфавиту, чтобы ничего не потерять.
export function exportTripToExcel(trip, calc, expenseColumns, squadNames) {
  const groupsHeader = ['№', 'ФИО', ...expenseColumns.map((c) => c.name), 'Итого', 'Оплачено', 'Долг', 'Переплата']
  const groups = groupBySquad(calc.players, squadNames || [], { includeUnassigned: false })

  let sheetData

  if (groups.length === 0) {
    const collator = new Intl.Collator('ru')
    const header = ['ФИО', 'Состав', ...expenseColumns.map((c) => c.name), 'Итого', 'Оплачено', 'Долг', 'Переплата']
    const rows = [...calc.players]
      .sort((a, b) => collator.compare(a.full_name, b.full_name))
      .map((p) => [
        p.full_name,
        p.squad || '',
        ...expenseColumns.map((c) => p.byColumn[c.id] ?? 0),
        p.total,
        p.paid,
        p.debt,
        p.overpaid,
      ])
    sheetData = [header, ...rows, [], totalsRow('ИТОГО', calc.players, expenseColumns)]
  } else {
    sheetData = []
    for (const g of groups) {
      sheetData.push([g.name])
      sheetData.push(groupsHeader)
      g.players.forEach((p, i) => sheetData.push(playerRow(p, i + 1, expenseColumns)))
      sheetData.push(totalsRow(`Итого — ${g.name}`, g.players, expenseColumns))
      sheetData.push([])
    }
    const exported = groups.flatMap((g) => g.players)
    sheetData.push(totalsRow('ИТОГО ПО ПОЕЗДКЕ', exported, expenseColumns))
  }

  const sheet = XLSX.utils.aoa_to_sheet(sheetData)
  sheet['!cols'] = [
    { wch: 6 },
    { wch: 28 },
    ...expenseColumns.map(() => ({ wch: 16 })),
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
  ]

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Расходы')

  const safeName = (trip.name || 'Поездка').replace(/[\\/:*?"<>|]/g, '_')
  XLSX.writeFile(workbook, `${safeName}.xlsx`)
}
