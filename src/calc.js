// Ядро расчёта затрат на поездку.
//
// Логика: питание/проживание/перекус считаются как расходы, "забронированные"
// на всю группу на весь срок поездки. Дневной бюджет по категории =
// тариф х количество игроков (изначальный состав). Эта сумма распределяется
// на игроков, фактически присутствующих в конкретный день. Если игрок уезжает
// раньше срока (или приезжает позже) — его недополученная доля автоматически
// перераспределяется на тех, кто присутствует в эти дни.
//
// Проезд — индивидуальная фиксированная сумма, не пересчитывается.
// Ручная корректировка — прибавляется/вычитается из итога как есть.

function toDateOnly(d) {
  const dt = new Date(d)
  dt.setHours(0, 0, 0, 0)
  return dt
}

function eachDay(start, end) {
  const days = []
  let cur = toDateOnly(start)
  const last = toDateOnly(end)
  while (cur <= last) {
    days.push(new Date(cur))
    cur = new Date(cur)
    cur.setDate(cur.getDate() + 1)
  }
  return days
}

function isPresent(player, day, tripStart, tripEnd) {
  const from = toDateOnly(player.arrival_date || tripStart)
  const to = toDateOnly(player.departure_date || tripEnd)
  return day >= from && day <= to
}

/**
 * Считает расходы по каждому игроку для одной поездки.
 * @param {{start_date:string,end_date:string,food_rate:number,stay_rate:number,snack_rate:number}} trip
 * @param {Array<{id:string,full_name:string,travel_cost:number,arrival_date?:string,departure_date?:string,adjustment?:number}>} players
 * @returns {Array} тот же список игроков + {food,stay,snack,total} и сводка
 */
export function calculateTrip(trip, players) {
  const days = eachDay(trip.start_date, trip.end_date)
  const N = players.length

  // Для каждого дня считаем, кто присутствует, и дневную ставку на человека
  const perDay = days.map((day) => {
    const presentPlayers = players.filter((p) =>
      isPresent(p, day, trip.start_date, trip.end_date)
    )
    const presentCount = presentPlayers.length
    const foodPerPerson = presentCount === 0 ? 0 : (trip.food_rate * N) / presentCount
    const stayPerPerson = presentCount === 0 ? 0 : (trip.stay_rate * N) / presentCount
    const snackPerPerson = presentCount === 0 ? 0 : (trip.snack_rate * N) / presentCount
    return { day, presentIds: new Set(presentPlayers.map((p) => p.id)), foodPerPerson, stayPerPerson, snackPerPerson }
  })

  const results = players.map((p) => {
    let food = 0
    let stay = 0
    let snack = 0
    for (const d of perDay) {
      if (d.presentIds.has(p.id)) {
        food += d.foodPerPerson
        stay += d.stayPerPerson
        snack += d.snackPerPerson
      }
    }
    const travel = Number(p.travel_cost) || 0
    const adjustment = Number(p.adjustment) || 0
    const total = food + stay + snack + travel + adjustment
    return {
      ...p,
      food: round2(food),
      stay: round2(stay),
      snack: round2(snack),
      travel: round2(travel),
      adjustment: round2(adjustment),
      total: round2(total),
    }
  })

  const summary = results.reduce(
    (acc, r) => ({
      food: acc.food + r.food,
      stay: acc.stay + r.stay,
      snack: acc.snack + r.snack,
      travel: acc.travel + r.travel,
      adjustment: acc.adjustment + r.adjustment,
      total: acc.total + r.total,
    }),
    { food: 0, stay: 0, snack: 0, travel: 0, adjustment: 0, total: 0 }
  )
  Object.keys(summary).forEach((k) => (summary[k] = round2(summary[k])))

  return { players: results, summary, days: days.length }
}

function round2(n) {
  return Math.round(n * 100) / 100
}
