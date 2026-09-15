import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { calculateTrip } from '../calc'
import { useClub } from '../ClubContext'

export default function PlayerCard() {
  const { playerId } = useParams()
  const { currentClub } = useClub()
  const [player, setPlayer] = useState(null)
  const [tripRows, setTripRows] = useState([]) // {trip, myRow}
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [nameForm, setNameForm] = useState('')

  async function loadAll() {
    setLoading(true)
    setError('')

    const { data: playerData, error: playerErr } = await supabase
      .from('roster_players')
      .select('*')
      .eq('id', playerId)
      .eq('club_id', currentClub.id)
      .single()
    if (playerErr) {
      setError('Ошибка загрузки игрока: ' + playerErr.message)
      setLoading(false)
      return
    }
    setPlayer(playerData)

    const { data: myTripPlayers, error: tpErr } = await supabase
      .from('trip_players')
      .select('id, trip_id, trips(id, name, start_date, end_date)')
      .eq('player_id', playerId)
    if (tpErr) {
      setError('Ошибка загрузки поездок: ' + tpErr.message)
      setLoading(false)
      return
    }

    const rows = []
    for (const mtp of myTripPlayers || []) {
      const tripId = mtp.trip_id

      const { data: allTp } = await supabase
        .from('trip_players')
        .select('id, player_id, roster_players(full_name)')
        .eq('trip_id', tripId)
      const players = (allTp || []).map((tp) => ({ id: tp.id, full_name: tp.roster_players?.full_name || '' }))

      const { data: cols } = await supabase
        .from('expense_columns')
        .select('*')
        .eq('trip_id', tripId)
        .order('sort_order', { ascending: true })
      const columnIds = (cols || []).map((c) => c.id)

      let participantsMap = new Map()
      let valuesMap = new Map()
      if (columnIds.length > 0) {
        const { data: partData } = await supabase
          .from('expense_participants')
          .select('column_id, trip_player_id')
          .in('column_id', columnIds)
        for (const row of partData || []) {
          if (!participantsMap.has(row.column_id)) participantsMap.set(row.column_id, new Set())
          participantsMap.get(row.column_id).add(row.trip_player_id)
        }
        const { data: valData } = await supabase
          .from('expense_values')
          .select('column_id, trip_player_id, amount')
          .in('column_id', columnIds)
        for (const row of valData || []) {
          if (!valuesMap.has(row.column_id)) valuesMap.set(row.column_id, new Map())
          valuesMap.get(row.column_id).set(row.trip_player_id, Number(row.amount) || 0)
        }
      }

      const tripPlayerIds = players.map((p) => p.id)
      let paymentsMap = new Map()
      if (tripPlayerIds.length > 0) {
        const { data: payData } = await supabase
          .from('payments')
          .select('*')
          .in('trip_player_id', tripPlayerIds)
          .order('paid_at', { ascending: true })
        for (const row of payData || []) {
          if (!paymentsMap.has(row.trip_player_id)) paymentsMap.set(row.trip_player_id, [])
          paymentsMap.get(row.trip_player_id).push(row)
        }
      }

      const calc = calculateTrip(players, cols || [], participantsMap, valuesMap, paymentsMap)
      const myRow = calc.players.find((r) => r.id === mtp.id)

      rows.push({ trip: mtp.trips, myRow })
    }

    rows.sort((a, b) => (a.trip?.start_date || '').localeCompare(b.trip?.start_date || ''))
    setTripRows(rows)
    setLoading(false)
  }

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId, currentClub.id])

  async function saveName() {
    const { error } = await supabase.from('roster_players').update({ full_name: nameForm }).eq('id', playerId)
    if (error) {
      setError('Ошибка сохранения: ' + error.message)
      return
    }
    setEditingName(false)
    loadAll()
  }

  if (loading) return <div className="page">Загрузка...</div>
  if (!player) return <div className="page">Игрок не найден.</div>

  const totals = tripRows.reduce(
    (acc, r) => ({
      total: acc.total + (r.myRow?.total || 0),
      paid: acc.paid + (r.myRow?.paid || 0),
    }),
    { total: 0, paid: 0 }
  )
  const netDebt = Math.max(0, totals.total - totals.paid)
  const netOverpaid = Math.max(0, totals.paid - totals.total)

  return (
    <div className="page">
      <p>
        <Link to="/players">← Все игроки</Link>
      </p>

      <div className="page-header">
        {editingName ? (
          <div>
            <input value={nameForm} onChange={(e) => setNameForm(e.target.value)} />
            <button onClick={saveName}>Сохранить</button>
            <button className="secondary" onClick={() => setEditingName(false)}>
              Отмена
            </button>
          </div>
        ) : (
          <h1>{player.full_name}</h1>
        )}
        {!editingName && (
          <button
            className="secondary"
            onClick={() => {
              setNameForm(player.full_name)
              setEditingName(true)
            }}
          >
            Изменить ФИО
          </button>
        )}
      </div>

      <div className="card">
        <p>
          <b>За весь сезон:</b> начислено {totals.total} ₽, оплачено {totals.paid} ₽
        </p>
        <p>
          {netDebt > 0 && <span className="error">Общий долг: {netDebt} ₽</span>}
          {netOverpaid > 0 && <span>Общая переплата: {netOverpaid} ₽</span>}
          {netDebt === 0 && netOverpaid === 0 && <span>Баланс ровный</span>}
        </p>
      </div>

      <h2>По поездкам</h2>
      {tripRows.length === 0 ? (
        <p className="hint">Этот игрок пока не участвовал ни в одной поездке.</p>
      ) : (
        <table className="trips-table">
          <thead>
            <tr>
              <th>Поездка</th>
              <th>Даты</th>
              <th>Итого</th>
              <th>Оплачено</th>
              <th>Долг</th>
              <th>Переплата</th>
            </tr>
          </thead>
          <tbody>
            {tripRows.map((r, i) => (
              <tr key={i}>
                <td>{r.trip ? <Link to={`/trips/${r.trip.id}`}>{r.trip.name}</Link> : '—'}</td>
                <td>
                  {r.trip?.start_date} — {r.trip?.end_date}
                </td>
                <td>{r.myRow?.total ?? 0}</td>
                <td>{r.myRow?.paid ?? 0}</td>
                <td className={r.myRow?.debt ? 'debt-owed' : ''}>{r.myRow?.debt ?? 0}</td>
                <td>{r.myRow?.overpaid ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Все платежи</h2>
      {tripRows.every((r) => (r.myRow?.payments || []).length === 0) ? (
        <p className="hint">Платежей пока нет.</p>
      ) : (
        <table className="trips-table">
          <thead>
            <tr>
              <th>Дата</th>
              <th>Поездка</th>
              <th>Сумма</th>
              <th>Комментарий</th>
            </tr>
          </thead>
          <tbody>
            {tripRows
              .flatMap((r) => (r.myRow?.payments || []).map((p) => ({ ...p, tripName: r.trip?.name })))
              .sort((a, b) => (a.paid_at || '').localeCompare(b.paid_at || ''))
              .map((p) => (
                <tr key={p.id}>
                  <td>{p.paid_at}</td>
                  <td>{p.tripName}</td>
                  <td>{p.amount} ₽</td>
                  <td>{p.note || '—'}</td>
                </tr>
              ))}
          </tbody>
        </table>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  )
}
