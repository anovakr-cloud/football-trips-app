import * as XLSX from 'xlsx'

// Выгружает таблицу поездки (статьи расходов + итоги) в .xlsx —
// строки игроков, столбцы — как на экране.
export function exportTripToExcel(trip, calc, expenseColumns) {
  const header = [
    'ФИО',
    'Состав',
    ...expenseColumns.map((c) => c.name),
    'Итого',
    'Оплачено',
    'Долг',
    'Переплата',
  ]

  const rows = calc.players.map((p) => [
    p.full_name,
    p.squad || '',
    ...expenseColumns.map((c) => p.byColumn[c.id] ?? 0),
    p.total,
    p.paid,
    p.debt,
    p.overpaid,
  ])

  const totalsRow = [
    'ИТОГО',
    '',
    ...expenseColumns.map((c) => calc.summary.byColumn[c.id] ?? 0),
    calc.summary.total,
    calc.summary.paid,
    calc.summary.debt,
    calc.summary.overpaid,
  ]

  const sheetData = [header, ...rows, [], totalsRow]
  const sheet = XLSX.utils.aoa_to_sheet(sheetData)
  sheet['!cols'] = [
    { wch: 28 },
    { wch: 12 },
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
