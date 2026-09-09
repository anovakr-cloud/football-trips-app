import { useEffect, useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { calculateTrip } from '../calc'

const emptyPlayer = {
  full_name: '',
  travel_cost: '',
  arrival_date: '',
  departure_date: '',
  adjustment: '',
  adjustment_note: '',
}

export default function TripDetail() {
  const { tripId } = useParams()
  const [trip, setTrip] = useState(null)
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingTrip, setEditingTrip] = useState(false)
  const [tripForm, setTripForm] = useState(null)
  const [newPlayer, setNewPlayer] = useState(emptyPlayer)
  const [editingPlayerId, setEditingPlayerId] = useState(null)
  const [editPlayerForm, setEditPlayerForm] = useState(null)
  const [error, setError] = useState('')

  async function loadAll() {
    setLoading(true)
    const { data: tripData, error: tripErr } = await supabase
      .from('trips')
      .select('*')
      .eq('id', tripId)
      .single()
    const { data: playersData, error: playersErr } = await supabase
      .from('players')
      .select('*')
      .eq('trip_id', tripId)
      .order('sort_order', { ascending: true })

    if (!tripErr) setTrip(tripData)
    if (!playersErr) setPlayers(playersData || [])
    setLoading(false)
  }

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId])

  const calc = useMemo(() => {
    if (!trip || players.length === 0) return null
    return calculateTrip(trip, players)
  }, [trip, players])

  async function handleAddPlayer(e) {
    e.preventDefault()
    setError('')
    if (!newPlayer.full_name) {
      setError('Укажите ФИО игрока')
      return
    }
    const { error } = await supabase.from('players').insert({
      trip_id: tripId,
      full_name: newPlayer.full_name,
      travel_cost: Number(newPlayer.travel_cost) || 0,
      arrival_date: newPlayer.arrival_date || null,
      departure_date: newPlayer.departure_date || null,
      adjustment: Number(newPlayer.adjustment) || 0,
      adjustment_note: newPlayer.adjustment_note || null,
      sort_order: players.length,
    })
    if (error) {
      setError('Ошибка сохранения: ' + error.message)
      return
    }
    setNewPlayer(emptyPlayer)
    loadAll()
  }

  async function handleDeletePlayer(id) {
    if (!confirm('Удалить игрока из этой поездки?')) return
    await supabase.from('players').delete().eq('id', id)
    loadAll()
  }

  function startEditPlayer(p) {
    setEditingPlayerId(p.id)
    setEditPlayerForm({
      full_name: p.full_name,
      travel_cost: p.travel_cost,
      arrival_date: p.arrival_date || '',
      departure_date: p.departure_date || '',
      adjustment: p.adjustment,
      adjustment_note: p.adjustment_note || '',
    })
  }

  async function saveEditPlayer(id) {
    const { error } = await supabase
      .from('players')
      .update({
        full_name: editPlayerForm.full_name,
        travel_cost: Number(editPlayerForm.travel_cost) || 0,
        arrival_date: editPlayerForm.arrival_date || null,
        departure_date: editPlayerForm.departure_date || null,
        adjustment: Number(editPlayerForm.adjustment) || 0,
        adjustment_note: editPlayerForm.adjustment_note || null,
      })
      .eq('id', id)
    if (error) {
      setError('Ошибка сохранения: ' + error.message)
      return
    }
    setEditingPlayerId(null)
    loadAll()
  }

  function startEditTrip() {
    setTripForm({
      name: trip.name,
      start_date: trip.start_date,
      end_date: trip.end_date,
      food_rate: trip.food_rate,
      stay_rate: trip.stay_rate,
      snack_rate: trip.snack_rate,
    })
    setEditingTrip(true)
  }

  async function saveTrip() {
    const { error } = await supabase
      .from('trips')
      .update({
        name: tripForm.name,
        start_date: tripForm.start_date,
        end_date: tripForm.end_date,
        food_rate: Number(tripForm.food_rate) || 0,
        stay_rate: Number(tripForm.stay_rate) || 0,
        snack_rate: Number(tripForm.snack_rate) || 0,
      })
      .eq('id', tripId)
    if (error) {
      setError('Ошибка сохранения: ' + error.message)
      return
    }
    setEditingTrip(false)
    loadAll()
  }

  if (loading) return <div className="page">Загрузка...</div>
  if (!trip) return <div className="page">Поездка не найдена.</div>

  const resultsByPlayerId = calc
    ? Object.fromEntries(calc.players.map((r) => [r.id, r]))
    : {}

  return (
    <div className="page">
      <p>
        <Link to="/">← Все поездки</Link>
      </p>

      <div className="page-header">
        <h1>{trip.name}</h1>
        <button className="secondary" onClick={startEditTrip}>
          Изменить параметры поездки
        </button>
      </div>
      <p className="muted">
        {trip.start_date} — {trip.end_date} · Тарифы/день: питание {trip.food_rate} ·
        проживание {trip.stay_rate} · перекус {trip.snack_rate}
      </p>

      {editingTrip && (
        <div className="card">
          <div className="grid">
            <label>
              Название
              <input value={tripForm.name} onChange={(e) => setTripForm({ ...tripForm, name: e.target.value })} />
            </label>
            <label>
              Дата начала
              <input type="date" value={tripForm.start_date} onChange={(e) => setTripForm({ ...tripForm, start_date: e.target.value })} />
            </label>
            <label>
              Дата окончания
              <input type="date" value={tripForm.end_date} onChange={(e) => setTripForm({ ...tripForm, end_date: e.target.value })} />
            </label>
            <label>
              Питание, руб/чел/день
              <input type="number" value={tripForm.food_rate} onChange={(e) => setTripForm({ ...tripForm, food_rate: e.target.value })} />
            </label>
            <label>
              Проживание, руб/чел/день
              <input type="number" value={tripForm.stay_rate} onChange={(e) => setTripForm({ ...tripForm, stay_rate: e.target.value })} />
            </label>
            <label>
              Перекус, руб/чел/день
              <input type="number" value={tripForm.snack_rate} onChange={(e) => setTripForm({ ...tripForm, snack_rate: e.target.value })} />
            </label>
          </div>
          <button onClick={saveTrip}>Сохранить</button>
          <button className="secondary" onClick={() => setEditingTrip(false)}>
            Отмена
          </button>
        </div>
      )}

      <h2>Игроки</h2>
      {error && <p className="error">{error}</p>}

      <table className="players-table">
        <thead>
          <tr>
            <th>ФИО</th>
            <th>Приезд</th>
            <th>Отъезд</th>
            <th>Проезд</th>
            <th>Питание</th>
            <th>Проживание</th>
            <th>Перекус</th>
            <th>Корректировка</th>
            <th>ИТОГО</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {players.map((p) => {
            const r = resultsByPlayerId[p.id]
            const isEditing = editingPlayerId === p.id
            if (isEditing) {
              return (
                <tr key={p.id} className="editing-row">
                  <td>
                    <input value={editPlayerForm.full_name} onChange={(e) => setEditPlayerForm({ ...editPlayerForm, full_name: e.target.value })} />
                  </td>
                  <td>
                    <input type="date" value={editPlayerForm.arrival_date} onChange={(e) => setEditPlayerForm({ ...editPlayerForm, arrival_date: e.target.value })} placeholder={trip.start_date} />
                  </td>
                  <td>
                    <input type="date" value={editPlayerForm.departure_date} onChange={(e) => setEditPlayerForm({ ...editPlayerForm, departure_date: e.target.value })} placeholder={trip.end_date} />
                  </td>
                  <td>
                    <input type="number" value={editPlayerForm.travel_cost} onChange={(e) => setEditPlayerForm({ ...editPlayerForm, travel_cost: e.target.value })} />
                  </td>
                  <td colSpan={3} className="muted">пересчитается после сохранения</td>
                  <td>
                    <input type="number" value={editPlayerForm.adjustment} onChange={(e) => setEditPlayerForm({ ...editPlayerForm, adjustment: e.target.value })} />
                    <input
                      className="note-input"
                      placeholder="комментарий"
                      value={editPlayerForm.adjustment_note}
                      onChange={(e) => setEditPlayerForm({ ...editPlayerForm, adjustment_note: e.target.value })}
                    />
                  </td>
                  <td></td>
                  <td>
                    <button onClick={() => saveEditPlayer(p.id)}>Сохранить</button>
                    <button className="secondary" onClick={() => setEditingPlayerId(null)}>
                      Отмена
                    </button>
                  </td>
                </tr>
              )
            }
            return (
              <tr key={p.id}>
                <td>{p.full_name}</td>
                <td>{p.arrival_date || '—'}</td>
                <td>{p.departure_date || '—'}</td>
                <td>{r?.travel ?? 0}</td>
                <td>{r?.food ?? 0}</td>
                <td>{r?.stay ?? 0}</td>
                <td>{r?.snack ?? 0}</td>
                <td title={p.adjustment_note || ''}>{r?.adjustment ?? 0}</td>
                <td className="total-cell">{r?.total ?? 0}</td>
                <td>
                  <button className="secondary" onClick={() => startEditPlayer(p)}>
                    Изм.
                  </button>
                  <button className="danger" onClick={() => handleDeletePlayer(p.id)}>
                    Удалить
                  </button>
                </td>
              </tr>
            )
          })}
          {calc && (
            <tr className="summary-row">
              <td colSpan={3}>ИТОГО по поездке</td>
              <td>{calc.summary.travel}</td>
              <td>{calc.summary.food}</td>
              <td>{calc.summary.stay}</td>
              <td>{calc.summary.snack}</td>
              <td>{calc.summary.adjustment}</td>
              <td className="total-cell">{calc.summary.total}</td>
              <td></td>
            </tr>
          )}
        </tbody>
      </table>

      <h3>Добавить игрока</h3>
      <form className="card" onSubmit={handleAddPlayer}>
        <div className="grid">
          <label>
            ФИО
            <input value={newPlayer.full_name} onChange={(e) => setNewPlayer({ ...newPlayer, full_name: e.target.value })} />
          </label>
          <label>
            Приезд (если позже начала поездки)
            <input type="date" value={newPlayer.arrival_date} onChange={(e) => setNewPlayer({ ...newPlayer, arrival_date: e.target.value })} />
          </label>
          <label>
            Отъезд (если раньше окончания)
            <input type="date" value={newPlayer.departure_date} onChange={(e) => setNewPlayer({ ...newPlayer, departure_date: e.target.value })} />
          </label>
          <label>
            Проезд, руб
            <input type="number" value={newPlayer.travel_cost} onChange={(e) => setNewPlayer({ ...newPlayer, travel_cost: e.target.value })} />
          </label>
          <label>
            Корректировка, руб (можно отрицательную)
            <input type="number" value={newPlayer.adjustment} onChange={(e) => setNewPlayer({ ...newPlayer, adjustment: e.target.value })} />
          </label>
          <label>
            Комментарий к корректировке
            <input value={newPlayer.adjustment_note} onChange={(e) => setNewPlayer({ ...newPlayer, adjustment_note: e.target.value })} />
          </label>
        </div>
        <button type="submit">Добавить игрока</button>
      </form>

      <p className="hint">
        Пустые даты приезда/отъезда означают, что игрок едет с начала и до конца
        поездки. Питание/проживание/перекус пересчитываются автоматически для
        всех игроков при любом изменении дат — доля выбывших/недоприехавших
        игроков раскидывается на тех, кто присутствует в эти дни.
      </p>
    </div>
  )
}
