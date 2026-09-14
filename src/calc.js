// Ядро расчёта затрат на поездку — версия с гибкими статьями расходов.
//
// Статья расходов бывает двух видов:
//   'computed' — есть общая сумма (total_amount) и список участников
//                (participantsByColumn), между которыми она делится поровну,
//                с округлением в большую сторону до целых рублей. У тех, кто
//                не включён в статью — просто 0.
//   'manual'   — значение вписывается вручную по каждому игроку
//                (valuesByColumn), ни на что автоматически не делится.
//
// Итого по игроку = сумма всех статей (computed + manual).
// Оплачено = сумма всех его платежей по этой поездке.
// Долг = Итого − Оплачено (если больше 0), Переплата = Оплачено − Итого
// (если больше 0). Всё округляется вверх до целых рублей.

export function roundUp(n) {
  const num = Number(n)
  if (!isFinite(num)) return 0
  return Math.ceil(num)
}

/**
 * @param {Array<{id:string, full_name:string}>} tripPlayers
 * @param {Array<{id:string, name:string, kind:'computed'|'manual', total_amount:number|null, item_date?:string|null}>} expenseColumns
 * @param {Map<string, Set<string>>} participantsByColumn — columnId -> набор tripPlayerId (только для computed)
 * @param {Map<string, Map<string, number>>} valuesByColumn — columnId -> (tripPlayerId -> сумма) (только для manual)
 * @param {Map<string, Array<{id:string, amount:number, paid_at:string, note?:string}>>} paymentsByTripPlayer
 */
export function calculateTrip(
  tripPlayers,
  expenseColumns,
  participantsByColumn,
  valuesByColumn,
  paymentsByTripPlayer
) {
  // Доля на человека для каждой computed-статьи
  const columnShare = new Map()
  for (const col of expenseColumns) {
    if (col.kind !== 'computed') continue
    const participants = participantsByColumn.get(col.id) || new Set()
    const count = participants.size
    const total = Number(col.total_amount) || 0
    columnShare.set(col.id, count === 0 ? 0 : roundUp(total / count))
  }

  const players = tripPlayers.map((tp) => {
    const byColumn = {}
    let total = 0
    for (const col of expenseColumns) {
      let value = 0
      if (col.kind === 'computed') {
        const participants = participantsByColumn.get(col.id) || new Set()
        value = participants.has(tp.id) ? columnShare.get(col.id) || 0 : 0
      } else {
        const values = valuesByColumn.get(col.id)
        value = values && values.has(tp.id) ? roundUp(values.get(tp.id)) : 0
      }
      byColumn[col.id] = value
      total += value
    }
    total = roundUp(total)

    const payments = paymentsByTripPlayer.get(tp.id) || []
    const paid = roundUp(payments.reduce((s, p) => s + (Number(p.amount) || 0), 0))
    const debt = Math.max(0, roundUp(total - paid))
    const overpaid = Math.max(0, roundUp(paid - total))

    return { ...tp, byColumn, total, paid, debt, overpaid, payments }
  })

  const summary = { total: 0, paid: 0, debt: 0, overpaid: 0, byColumn: {} }
  for (const col of expenseColumns) summary.byColumn[col.id] = 0
  for (const r of players) {
    summary.total += r.total
    summary.paid += r.paid
    summary.debt += r.debt
    summary.overpaid += r.overpaid
    for (const col of expenseColumns) summary.byColumn[col.id] += r.byColumn[col.id]
  }

  return { players, summary, columnShare }
}
