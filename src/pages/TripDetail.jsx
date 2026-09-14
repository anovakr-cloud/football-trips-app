import { Fragment, useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { calculateTrip, roundUp } from '../calc'
import { exportTripToExcel } from '../exportExcel'
import ImportPlayersModal from '../components/ImportPlayersModal'

export default function TripDetail() {
  const { tripId } = useParams()
  const [trip, setTrip] = useState(null)
  const [tripPlayers, setTripPlayers] = useState([]) // {id, player_id, full_name, arrival_date, departure_date}
  const [expenseColumns, setExpenseColumns] = useState([])
  const [participantsByColumn, setParticipantsByColumn] = useState(new Map())
  const [valuesByColumn, setValuesByColumn] = useState(new Map())
  const [paymentsByTripPlayer, setPaymentsByTripPlayer] = useState(new Map())
  const [rosterOptions, setRosterOptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [editingTrip, setEditingTrip] = useState(false)
  const [tripForm, setTripForm] = useState(null)

  const [newColumnKind, setNewColumnKind] = useState(null) // 'computed' | 'manual' | null
  const [newColumnForm, setNewColumnForm] = useState({ name: '', item_date: '', total_amount: '' })

  const [editingColumnId, setEditingColumnId] = useState(null)
  const [editColumnForm, setEditColumnForm] = useState(null)

  const [manualDraft, setManualDraft] = useState({}) // `${columnId}:${tripPlayerId}` -> string
  const [fillDraft, setFillDraft] = useState({}) // columnId -> string

  const [expandedPaymentsFor, setExpandedPaymentsFor] = useState(null)
  const [newPaymentForm, setNewPaymentForm] = useState({ amount: '', paid_at: '', note: '' })

  const [showImport, setShowImport] = useState(false)
  const [addPlayerName, setAddPlayerName] = useState('')

  async function loadAll() {
    setLoading(true)
    setError('')

    const { data: tripData, error: tripErr } = await supabase
      .from('trips')
      .select('*')
      .eq('id', tripId)
      .single()
    if (tripErr) {
      setError('Ошибка загрузки поездки: ' + tripErr.message)
      setLoading(false)
      return
    }
    setTrip(tripData)

    const { data: tpData, error: tpErr } = await supabase
      .from('trip_players')
      .select('id, player_id, arrival_date, departure_date, sort_order, roster_players(full_name)')
      .eq('trip_id', tripId)
      .order('sort_order', { ascending: true })
    if (tpErr) {
      setError('Ошибка загрузки игроков: ' + tpErr.message)
      setLoading(false)
      return
    }
    const players = (tpData || []).map((tp) => ({
      id: tp.id,
      player_id: tp.player_id,
      full_name: tp.roster_players?.full_name || '(без имени)',
      arrival_date: tp.arrival_date,
      departure_date: tp.departure_date,
    }))
    setTripPlayers(players)

    const { data: colData, error: colErr } = await supabase
      .from('expense_columns')
      .select('*')
      .eq('trip_id', tripId)
      .order('sort_order', { ascending: true })
    if (colErr) {
      setError('Ошибка загрузки статей расходов: ' + colErr.message)
      setLoading(false)
      return
    }
    setExpenseColumns(colData || [])

    const columnIds = (colData || []).map((c) => c.id)
    const tripPlayerIds = players.map((p) => p.id)

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
    setParticipantsByColumn(participantsMap)
    setValuesByColumn(valuesMap)

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
    setPaymentsByTripPlayer(paymentsMap)

    const { data: rosterData } = await supabase
      .from('roster_players')
      .select('id, full_name')
      .order('full_name', { ascending: true })
    setRosterOptions(rosterData || [])

    setLoading(false)
  }

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId])

  const calc = useMemo(() => {
    if (!tripPlayers.length) return null
    return calculateTrip(tripPlayers, expenseColumns, participantsByColumn, valuesByColumn, paymentsByTripPlayer)
  }, [tripPlayers, expenseColumns, participantsByColumn, valuesByColumn, paymentsByTripPlayer])

  const resultsByTripPlayerId = calc ? Object.fromEntries(calc.players.map((r) => [r.id, r])) : {}

  // ---------- Параметры поездки ----------

  function startEditTrip() {
    setTripForm({
      name: trip.name,
      start_date: trip.start_date,
      end_date: trip.end_date,
      notes: trip.notes || '',
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
        notes: tripForm.notes || null,
      })
      .eq('id', tripId)
    if (error) {
      setError('Ошибка сохранения: ' + error.message)
      return
    }
    setEditingTrip(false)
    loadAll()
  }

  // ---------- Статьи расходов ----------

  function openNewColumnForm(kind) {
    setNewColumnKind(kind)
    setNewColumnForm({ name: '', item_date: '', total_amount: '' })
  }

  async function submitNewColumn(e) {
    e.preventDefault()
    if (!newColumnForm.name.trim()) {
      setError('Укажите название статьи')
      return
    }
    setError('')
    const { error } = await supabase.from('expense_columns').insert({
      trip_id: tripId,
      name: newColumnForm.name.trim(),
      kind: newColumnKind,
      item_date: newColumnForm.item_date || null,
      total_amount: newColumnKind === 'computed' ? Number(newColumnForm.total_amount) || 0 : null,
      sort_order: expenseColumns.length,
    })
    if (error) {
      setError('Ошибка сохранения: ' + error.message)
      return
    }
    setNewColumnKind(null)
    loadAll()
  }

  function startEditColumn(col) {
    setEditingColumnId(col.id)
    setEditColumnForm({
      name: col.name,
      item_date: col.item_date || '',
      total_amount: col.total_amount ?? '',
    })
  }

  async function saveEditColumn(col) {
    const { error } = await supabase
      .from('expense_columns')
      .update({
        name: editColumnForm.name.trim(),
        item_date: editColumnForm.item_date || null,
        total_amount: col.kind === 'computed' ? Number(editColumnForm.total_amount) || 0 : null,
      })
      .eq('id', col.id)
    if (error) {
      setError('Ошибка сохранения: ' + error.message)
      return
    }
    setEditingColumnId(null)
    loadAll()
  }

  async function deleteColumn(col) {
    if (!confirm(`Удалить статью «${col.name}»? Значения по игрокам тоже удалятся.`)) return
    await supabase.from('expense_columns').delete().eq('id', col.id)
    loadAll()
  }

  async function toggleParticipant(col, tripPlayerId) {
    const set = participantsByColumn.get(col.id) || new Set()
    if (set.has(tripPlayerId)) {
      await supabase
        .from('expense_participants')
        .delete()
        .eq('column_id', col.id)
        .eq('trip_player_id', tripPlayerId)
    } else {
      await supabase.from('expense_participants').insert({ column_id: col.id, trip_player_id: tripPlayerId })
    }
    loadAll()
  }

  async function selectAllParticipants(col) {
    const rows = tripPlayers.map((tp) => ({ column_id: col.id, trip_player_id: tp.id }))
    await supabase.from('expense_participants').delete().eq('column_id', col.id)
    if (rows.length > 0) await supabase.from('expense_participants').insert(rows)
    loadAll()
  }

  async function clearAllParticipants(col) {
    await supabase.from('expense_participants').delete().eq('column_id', col.id)
    loadAll()
  }

  function manualKey(columnId, tripPlayerId) {
    return `${columnId}:${tripPlayerId}`
  }

  function getManualDisplayValue(col, tripPlayerId) {
    const key = manualKey(col.id, tripPlayerId)
    if (key in manualDraft) return manualDraft[key]
    const values = valuesByColumn.get(col.id)
    const v = values ? values.get(tripPlayerId) : 0
    return v ? String(v) : ''
  }

  function onManualChange(col, tripPlayerId, text) {
    setManualDraft((d) => ({ ...d, [manualKey(col.id, tripPlayerId)]: text }))
  }

  async function commitManualValue(col, tripPlayerId) {
    const key = manualKey(col.id, tripPlayerId)
    if (!(key in manualDraft)) return
    const amount = Number(manualDraft[key]) || 0
    await supabase
      .from('expense_values')
      .upsert({ column_id: col.id, trip_player_id: tripPlayerId, amount }, { onConflict: 'column_id,trip_player_id' })
    setManualDraft((d) => {
      const copy = { ...d }
      delete copy[key]
      return copy
    })
    loadAll()
  }

  async function fillAllManual(col) {
    const raw = fillDraft[col.id]
    const amount = Number(raw) || 0
    if (tripPlayers.length === 0) return
    if (!confirm(`Проставить ${amount} ₽ всем ${tripPlayers.length} игрокам в статье «${col.name}»? Текущие значения будут перезаписаны.`)) {
      return
    }
    const rows = tripPlayers.map((tp) => ({ column_id: col.id, trip_player_id: tp.id, amount }))
    await supabase.from('expense_values').upsert(rows, { onConflict: 'column_id,trip_player_id' })
    setFillDraft((d) => ({ ...d, [col.id]: '' }))
    loadAll()
  }

  // ---------- Игроки поездки ----------

  async function addExistingPlayer(rosterPlayerId) {
    if (!rosterPlayerId) return
    setError('')
    const { error } = await supabase.from('trip_players').insert({
      trip_id: tripId,
      player_id: rosterPlayerId,
      sort_order: tripPlayers.length,
    })
    if (error) {
      setError('Ошибка добавления: ' + error.message)
      return
    }
    loadAll()
  }

  async function addNewPlayer(e) {
    e.preventDefault()
    const name = addPlayerName.trim()
    if (!name) return
    setError('')
    const { data: rp, error: rpErr } = await supabase
      .from('roster_players')
      .insert({ full_name: name })
      .select()
      .single()
    if (rpErr) {
      setError('Ошибка добавления игрока в состав: ' + rpErr.message)
      return
    }
    const { error: tpErr } = await supabase.from('trip_players').insert({
      trip_id: tripId,
      player_id: rp.id,
      sort_order: tripPlayers.length,
    })
    if (tpErr) {
      setError('Ошибка добавления в поездку: ' + tpErr.message)
      return
    }
    setAddPlayerName('')
    loadAll()
  }

  async function removeFromTrip(tp) {
    if (!confirm(`Убрать ${tp.full_name} из этой поездки? Все его статьи расходов и платежи по этой поездке удалятся. Из общего состава игрок не пропадёт.`)) return
    await supabase.from('trip_players').delete().eq('id', tp.id)
    loadAll()
  }

  async function saveDates(tp, field, value) {
    await supabase
      .from('trip_players')
      .update({ [field]: value || null })
      .eq('id', tp.id)
    loadAll()
  }

  // ---------- Платежи ----------

  function openPayments(tripPlayerId) {
    setExpandedPaymentsFor((cur) => (cur === tripPlayerId ? null : tripPlayerId))
    setNewPaymentForm({ amount: '', paid_at: new Date().toISOString().slice(0, 10), note: '' })
  }

  async function addPayment(tripPlayerId) {
    const amount = Number(newPaymentForm.amount) || 0
    if (!amount) {
      setError('Укажите сумму платежа')
      return
    }
    setError('')
    const { error } = await supabase.from('payments').insert({
      trip_player_id: tripPlayerId,
      amount,
      paid_at: newPaymentForm.paid_at || new Date().toISOString().slice(0, 10),
      note: newPaymentForm.note || null,
    })
    if (error) {
      setError('Ошибка сохранения платежа: ' + error.message)
      return
    }
    setNewPaymentForm({ amount: '', paid_at: new Date().toISOString().slice(0, 10), note: '' })
    loadAll()
  }

  async function deletePayment(paymentId) {
    if (!confirm('Удалить этот платёж?')) return
    await supabase.from('payments').delete().eq('id', paymentId)
    loadAll()
  }

  // ---------- Excel ----------

  function handleExport() {
    if (!calc) return
    exportTripToExcel(trip, calc, expenseColumns)
  }

  if (loading) return <div className="page">Загрузка...</div>
  if (!trip) return <div className="page">Поездка не найдена.</div>

  const rosterNotInTrip = rosterOptions.filter((rp) => !tripPlayers.some((tp) => tp.player_id === rp.id))

  return (
    <div className="page">
      <p>
        <Link to="/">← Все поездки</Link>
      </p>

      <div className="page-header">
        <h1>{trip.name}</h1>
        <div>
          <button className="secondary" onClick={startEditTrip}>
            Изменить параметры поездки
          </button>
          <button className="secondary" onClick={handleExport} disabled={!calc}>
            Выгрузить в Excel
          </button>
        </div>
      </div>
      <p className="muted">
        {trip.start_date} — {trip.end_date}
        {trip.notes ? ` · ${trip.notes}` : ''}
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
              Заметка
              <input value={tripForm.notes} onChange={(e) => setTripForm({ ...tripForm, notes: e.target.value })} />
            </label>
          </div>
          <button onClick={saveTrip}>Сохранить</button>
          <button className="secondary" onClick={() => setEditingTrip(false)}>
            Отмена
          </button>
        </div>
      )}

      {error && <p className="error">{error}</p>}

      {/* ---------- Статьи расходов ---------- */}
      <div className="page-header">
        <h2>Статьи расходов</h2>
        <div>
          <button className="secondary" onClick={() => openNewColumnForm('computed')}>
            + Расчётная статья
          </button>
          <button className="secondary" onClick={() => openNewColumnForm('manual')}>
            + Произвольная статья
          </button>
        </div>
      </div>

      {newColumnKind && (
        <form className="card" onSubmit={submitNewColumn}>
          <p className="hint">
            {newColumnKind === 'computed'
              ? 'Расчётная статья: указываешь общую сумму, а участников отмечаешь галочками прямо в таблице — сумма поделится поровну между ними.'
              : 'Произвольная статья: значение по каждому игроку вписывается вручную.'}
          </p>
          <div className="grid">
            <label>
              Название
              <input value={newColumnForm.name} onChange={(e) => setNewColumnForm({ ...newColumnForm, name: e.target.value })} autoFocus />
            </label>
            <label>
              Дата (необязательно)
              <input type="date" value={newColumnForm.item_date} onChange={(e) => setNewColumnForm({ ...newColumnForm, item_date: e.target.value })} />
            </label>
            {newColumnKind === 'computed' && (
              <label>
                Сумма всего, ₽
                <input type="number" value={newColumnForm.total_amount} onChange={(e) => setNewColumnForm({ ...newColumnForm, total_amount: e.target.value })} />
              </label>
            )}
          </div>
          <button type="submit">Добавить</button>
          <button type="button" className="secondary" onClick={() => setNewColumnKind(null)}>
            Отмена
          </button>
        </form>
      )}

      {expenseColumns.length > 0 && (
        <table className="players-table">
          <thead>
            <tr>
              <th>Статья</th>
              <th>Тип</th>
              <th>Дата</th>
              <th>Сумма всего</th>
              <th>Участников</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {expenseColumns.map((col) => {
              const isEditing = editingColumnId === col.id
              const count = (participantsByColumn.get(col.id) || new Set()).size
              if (isEditing) {
                return (
                  <tr key={col.id} className="editing-row">
                    <td>
                      <input value={editColumnForm.name} onChange={(e) => setEditColumnForm({ ...editColumnForm, name: e.target.value })} />
                    </td>
                    <td className="muted">{col.kind === 'computed' ? 'расчётная' : 'произвольная'}</td>
                    <td>
                      <input type="date" value={editColumnForm.item_date} onChange={(e) => setEditColumnForm({ ...editColumnForm, item_date: e.target.value })} />
                    </td>
                    <td>
                      {col.kind === 'computed' ? (
                        <input type="number" value={editColumnForm.total_amount} onChange={(e) => setEditColumnForm({ ...editColumnForm, total_amount: e.target.value })} />
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="muted">{col.kind === 'computed' ? `${count} из ${tripPlayers.length}` : '—'}</td>
                    <td>
                      <button onClick={() => saveEditColumn(col)}>Сохранить</button>
                      <button className="secondary" onClick={() => setEditingColumnId(null)}>
                        Отмена
                      </button>
                    </td>
                  </tr>
                )
              }
              return (
                <tr key={col.id}>
                  <td>{col.name}</td>
                  <td className="muted">{col.kind === 'computed' ? 'расчётная' : 'произвольная'}</td>
                  <td>{col.item_date || '—'}</td>
                  <td>{col.kind === 'computed' ? `${col.total_amount ?? 0} ₽` : '—'}</td>
                  <td>
                    {col.kind === 'computed' ? (
                      <>
                        {count} из {tripPlayers.length}{' '}
                        <button className="secondary" onClick={() => selectAllParticipants(col)}>
                          все
                        </button>
                        <button className="secondary" onClick={() => clearAllParticipants(col)}>
                          никто
                        </button>
                      </>
                    ) : (
                      <span className="muted">
                        заполнить всем:{' '}
                        <input
                          className="note-input"
                          style={{ width: 90, display: 'inline-block' }}
                          type="number"
                          value={fillDraft[col.id] || ''}
                          onChange={(e) => setFillDraft((d) => ({ ...d, [col.id]: e.target.value }))}
                        />
                        <button className="secondary" onClick={() => fillAllManual(col)}>
                          ОК
                        </button>
                      </span>
                    )}
                  </td>
                  <td>
                    <button className="secondary" onClick={() => startEditColumn(col)}>
                      Изм.
                    </button>
                    <button className="danger" onClick={() => deleteColumn(col)}>
                      Удалить
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {/* ---------- Игроки и расходы ---------- */}
      <div className="page-header">
        <h2>Игроки</h2>
        <button className="secondary" onClick={() => setShowImport((v) => !v)}>
          {showImport ? 'Отмена импорта' : 'Импорт из Excel/CSV'}
        </button>
      </div>

      {showImport && (
        <ImportPlayersModal
          tripId={tripId}
          startOrder={tripPlayers.length}
          existingPlayerIds={new Set(tripPlayers.map((tp) => tp.player_id))}
          onCancel={() => setShowImport(false)}
          onDone={(skipped) => {
            setShowImport(false)
            if (skipped) setError(`Импорт завершён, ${skipped} чел. пропущено — уже были в этой поездке.`)
            loadAll()
          }}
        />
      )}

      {expenseColumns.length === 0 ? (
        <p className="hint">Сначала добавь хотя бы одну статью расходов выше — тогда появится таблица по игрокам.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="players-table">
            <thead>
              <tr>
                <th>ФИО</th>
                <th>Приезд</th>
                <th>Отъезд</th>
                {expenseColumns.map((col) => (
                  <th key={col.id} title={col.kind === 'computed' ? 'клик по ячейке — включить/выключить игрока в статью' : 'вписывается вручную'}>
                    {col.name}
                  </th>
                ))}
                <th>Итого</th>
                <th>Оплачено</th>
                <th>Долг</th>
                <th>Переплата</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tripPlayers.map((tp) => {
                const r = resultsByTripPlayerId[tp.id]
                const isPaymentsOpen = expandedPaymentsFor === tp.id
                return (
                  <Fragment key={tp.id}>
                    <tr>
                      <td>
                        <Link to={`/players/${tp.player_id}`}>{tp.full_name}</Link>
                      </td>
                      <td>
                        <input
                          type="date"
                          className="note-input"
                          value={tp.arrival_date || ''}
                          onChange={(e) => saveDates(tp, 'arrival_date', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="date"
                          className="note-input"
                          value={tp.departure_date || ''}
                          onChange={(e) => saveDates(tp, 'departure_date', e.target.value)}
                        />
                      </td>
                      {expenseColumns.map((col) => {
                        if (col.kind === 'computed') {
                          const included = (participantsByColumn.get(col.id) || new Set()).has(tp.id)
                          return (
                            <td
                              key={col.id}
                              className={included ? 'checkbox-cell included' : 'checkbox-cell excluded'}
                              onClick={() => toggleParticipant(col, tp.id)}
                              title={included ? 'включён — клик, чтобы убрать' : 'не включён — клик, чтобы добавить'}
                            >
                              {included ? r?.byColumn[col.id] ?? 0 : '—'}
                            </td>
                          )
                        }
                        return (
                          <td key={col.id}>
                            <input
                              type="number"
                              className="note-input"
                              value={getManualDisplayValue(col, tp.id)}
                              onChange={(e) => onManualChange(col, tp.id, e.target.value)}
                              onBlur={() => commitManualValue(col, tp.id)}
                            />
                          </td>
                        )
                      })}
                      <td className="total-cell">{r?.total ?? 0}</td>
                      <td>
                        <button className="secondary" onClick={() => openPayments(tp.id)}>
                          {r?.paid ?? 0} ₽
                        </button>
                      </td>
                      <td>{r?.debt ?? 0}</td>
                      <td>{r?.overpaid ?? 0}</td>
                      <td>
                        <button className="danger" onClick={() => removeFromTrip(tp)}>
                          Убрать
                        </button>
                      </td>
                    </tr>
                    {isPaymentsOpen && (
                      <tr className="editing-row">
                        <td colSpan={7 + expenseColumns.length}>
                          <b>Платежи — {tp.full_name}</b>
                          <table className="players-table" style={{ marginTop: 8 }}>
                            <thead>
                              <tr>
                                <th>Дата</th>
                                <th>Сумма</th>
                                <th>Комментарий</th>
                                <th></th>
                              </tr>
                            </thead>
                            <tbody>
                              {(r?.payments || []).map((p) => (
                                <tr key={p.id}>
                                  <td>{p.paid_at}</td>
                                  <td>{p.amount} ₽</td>
                                  <td>{p.note || '—'}</td>
                                  <td>
                                    <button className="danger" onClick={() => deletePayment(p.id)}>
                                      Удалить
                                    </button>
                                  </td>
                                </tr>
                              ))}
                              <tr>
                                <td>
                                  <input
                                    type="date"
                                    value={newPaymentForm.paid_at}
                                    onChange={(e) => setNewPaymentForm({ ...newPaymentForm, paid_at: e.target.value })}
                                  />
                                </td>
                                <td>
                                  <input
                                    type="number"
                                    placeholder="сумма"
                                    value={newPaymentForm.amount}
                                    onChange={(e) => setNewPaymentForm({ ...newPaymentForm, amount: e.target.value })}
                                  />
                                </td>
                                <td>
                                  <input
                                    placeholder="комментарий"
                                    value={newPaymentForm.note}
                                    onChange={(e) => setNewPaymentForm({ ...newPaymentForm, note: e.target.value })}
                                  />
                                </td>
                                <td>
                                  <button onClick={() => addPayment(tp.id)}>Добавить</button>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
              {calc && (
                <tr className="summary-row">
                  <td colSpan={3}>ИТОГО по поездке</td>
                  {expenseColumns.map((col) => (
                    <td key={col.id}>{calc.summary.byColumn[col.id] ?? 0}</td>
                  ))}
                  <td className="total-cell">{calc.summary.total}</td>
                  <td>{calc.summary.paid}</td>
                  <td>{calc.summary.debt}</td>
                  <td>{calc.summary.overpaid}</td>
                  <td></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <h3>Добавить игрока в поездку</h3>
      <div className="card">
        <div className="grid">
          <label>
            Из состава
            <select onChange={(e) => addExistingPlayer(e.target.value)} value="">
              <option value="">— выбрать —</option>
              {rosterNotInTrip.map((rp) => (
                <option key={rp.id} value={rp.id}>
                  {rp.full_name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <form onSubmit={addNewPlayer} style={{ marginTop: 8 }}>
          <label>
            Новый игрок (ФИО) — добавится и в общий состав
            <input value={addPlayerName} onChange={(e) => setAddPlayerName(e.target.value)} />
          </label>
          <button type="submit" style={{ marginTop: 8 }}>
            Добавить нового
          </button>
        </form>
      </div>

      <p className="hint">
        Клик по ячейке расчётной статьи включает/выключает игрока в ней — сумма делится поровну между
        включёнными и округляется вверх до целого рубля. Произвольные статьи — просто впиши число, оно
        сохранится, когда уберёшь курсор из поля. «Оплачено» — кнопка со списком платежей по датам, клик
        открывает/закрывает список под строкой.
      </p>
    </div>
  )
}
