import { Fragment, useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { calculateTrip, roundUp } from '../calc'
import { exportTripToExcel } from '../exportExcel'
import ImportPlayersModal from '../components/ImportPlayersModal'
import { SQUADS, groupBySquad } from '../squads'

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

  const [templates, setTemplates] = useState([])
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const [selectedTemplateIds, setSelectedTemplateIds] = useState(new Set())
  const [addingTemplates, setAddingTemplates] = useState(false)

  const [editingColumnId, setEditingColumnId] = useState(null)
  const [editColumnForm, setEditColumnForm] = useState(null)

  const [manualDraft, setManualDraft] = useState({}) // `${columnId}:${tripPlayerId}` -> string
  const [fillDraft, setFillDraft] = useState({}) // columnId -> string
  const [fillTargetDraft, setFillTargetDraft] = useState({}) // columnId -> 'all' | squad name

  const [expandedPaymentsFor, setExpandedPaymentsFor] = useState(null)
  const [newPaymentForm, setNewPaymentForm] = useState({ amount: '', paid_at: '', note: '' })

  const [showImport, setShowImport] = useState(false)
  const [addPlayerName, setAddPlayerName] = useState('')
  const [addSquad, setAddSquad] = useState('')

  const [squadFilter, setSquadFilter] = useState('all') // 'all' | 'Состав 1' | 'Состав 2'
  const [bulkPaymentForm, setBulkPaymentForm] = useState({
    squad: 'all',
    amount: '',
    paid_at: new Date().toISOString().slice(0, 10),
    note: '',
  })
  const [bulkSaving, setBulkSaving] = useState(false)

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
      .select('id, player_id, arrival_date, departure_date, squad, sort_order, roster_players(full_name)')
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
      squad: tp.squad || '',
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
      .select('id, full_name, default_squad')
      .order('full_name', { ascending: true })
    setRosterOptions(rosterData || [])

    setLoading(false)
  }

  async function loadTemplates() {
    const { data } = await supabase
      .from('expense_column_templates')
      .select('*')
      .order('sort_order', { ascending: true })
    setTemplates(data || [])
  }

  useEffect(() => {
    loadAll()
    loadTemplates()
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

  function toggleTemplateSelection(id) {
    setSelectedTemplateIds((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function addSelectedTemplates() {
    const chosen = availableTemplates.filter((t) => selectedTemplateIds.has(t.id))
    if (chosen.length === 0) return
    setAddingTemplates(true)
    const rows = chosen.map((t, i) => ({
      trip_id: tripId,
      name: t.name,
      kind: t.kind,
      total_amount: t.kind === 'computed' ? 0 : null,
      sort_order: expenseColumns.length + i,
    }))
    const { error } = await supabase.from('expense_columns').insert(rows)
    setAddingTemplates(false)
    if (error) {
      setError('Ошибка добавления статей: ' + error.message)
      return
    }
    setSelectedTemplateIds(new Set())
    setShowTemplatePicker(false)
    loadAll()
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

  async function moveColumn(index, direction) {
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= expenseColumns.length) return
    // Переставляем элемент в массиве и перенумеровываем sort_order у ВСЕХ
    // статей подряд (0..N-1), а не просто меняем местами два старых значения:
    // после удалений/добавлений статьи могли задвоиться по sort_order
    // (например, обе стать с одинаковым значением), и точечный обмен в таком
    // случае визуально ничего не менял. Перенумерация сразу чинит порядок
    // навсегда, даже если он уже был "сбит" раньше.
    const reordered = [...expenseColumns]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(targetIndex, 0, moved)
    setError('')
    const results = await Promise.all(
      reordered.map((col, i) => supabase.from('expense_columns').update({ sort_order: i }).eq('id', col.id))
    )
    const failed = results.find((r) => r.error)
    if (failed) {
      setError('Ошибка изменения порядка: ' + failed.error.message)
      return
    }
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
    const target = fillTargetDraft[col.id] || 'all'
    const targets = target === 'all' ? tripPlayers : tripPlayers.filter((tp) => tp.squad === target)
    if (targets.length === 0) {
      setError(target === 'all' ? 'В поездке пока нет игроков' : `В составе «${target}» нет игроков в этой поездке`)
      return
    }
    const label = target === 'all' ? `всем ${targets.length} игрокам` : `составу «${target}» (${targets.length} чел.)`
    if (!confirm(`Проставить ${amount} ₽ ${label} в статье «${col.name}»? Текущие значения будут перезаписаны.`)) {
      return
    }
    setError('')
    const rows = targets.map((tp) => ({ column_id: col.id, trip_player_id: tp.id, amount }))
    await supabase.from('expense_values').upsert(rows, { onConflict: 'column_id,trip_player_id' })
    setFillDraft((d) => ({ ...d, [col.id]: '' }))
    loadAll()
  }

  // ---------- Игроки поездки ----------

  async function addExistingPlayer(rosterPlayerId) {
    if (!rosterPlayerId) return
    setError('')
    const rp = rosterOptions.find((r) => r.id === rosterPlayerId)
    const { error } = await supabase.from('trip_players').insert({
      trip_id: tripId,
      player_id: rosterPlayerId,
      squad: rp?.default_squad || null,
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
    const dup = rosterOptions.find((rp) => rp.full_name.trim().toLowerCase() === name.toLowerCase())
    if (dup) {
      if (
        !confirm(
          `Игрок с именем «${dup.full_name}» уже есть в общем составе. Добавить ещё одного с таким же именем (это будет отдельный, самостоятельный игрок с чистой историей)? Если это тот же ребёнок — отмените и выберите его из списка «Из общего состава» ниже.`
        )
      ) {
        return
      }
    }
    setError('')
    const { data: rp, error: rpErr } = await supabase
      .from('roster_players')
      .insert({ full_name: name, default_squad: addSquad || null })
      .select()
      .single()
    if (rpErr) {
      setError('Ошибка добавления игрока в состав: ' + rpErr.message)
      return
    }
    const { error: tpErr } = await supabase.from('trip_players').insert({
      trip_id: tripId,
      player_id: rp.id,
      squad: addSquad || null,
      sort_order: tripPlayers.length,
    })
    if (tpErr) {
      setError('Ошибка добавления в поездку: ' + tpErr.message)
      return
    }
    setAddPlayerName('')
    loadAll()
  }

  async function bulkAddFromSquad(squadName) {
    const inTripIds = new Set(tripPlayers.map((tp) => tp.player_id))
    const candidates = rosterOptions.filter((rp) => rp.default_squad === squadName && !inTripIds.has(rp.id))
    if (candidates.length === 0) {
      setError(`В общем составе нет игроков с составом по умолчанию «${squadName}», которых ещё нет в этой поездке.`)
      return
    }
    if (!confirm(`Добавить в поездку сразу ${candidates.length} чел. (состав «${squadName}»)?`)) return
    setError('')
    const rows = candidates.map((rp, i) => ({
      trip_id: tripId,
      player_id: rp.id,
      squad: squadName,
      sort_order: tripPlayers.length + i,
    }))
    const { error } = await supabase.from('trip_players').insert(rows)
    if (error) {
      setError('Ошибка массового добавления: ' + error.message)
      return
    }
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

  async function saveSquad(tp, value) {
    await supabase
      .from('trip_players')
      .update({ squad: value || null })
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

  async function bulkAddPayment(e) {
    e.preventDefault()
    const amount = Number(bulkPaymentForm.amount) || 0
    if (!amount) {
      setError('Укажите сумму платежа')
      return
    }
    const targets =
      bulkPaymentForm.squad === 'all' ? tripPlayers : tripPlayers.filter((tp) => tp.squad === bulkPaymentForm.squad)
    if (targets.length === 0) {
      setError('В выбранной группе нет игроков')
      return
    }
    const label = bulkPaymentForm.squad === 'all' ? 'всем игрокам поездки' : `составу «${bulkPaymentForm.squad}»`
    if (!confirm(`Внести платёж ${amount} ₽ от ${bulkPaymentForm.paid_at || 'сегодня'} ${label} — ${targets.length} чел.?`)) {
      return
    }
    setError('')
    setBulkSaving(true)
    const rows = targets.map((tp) => ({
      trip_player_id: tp.id,
      amount,
      paid_at: bulkPaymentForm.paid_at || new Date().toISOString().slice(0, 10),
      note: bulkPaymentForm.note || null,
    }))
    const { error } = await supabase.from('payments').insert(rows)
    setBulkSaving(false)
    if (error) {
      setError('Ошибка массовой оплаты: ' + error.message)
      return
    }
    setBulkPaymentForm((f) => ({ ...f, amount: '', note: '' }))
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

  const existingColumnNames = new Set(expenseColumns.map((c) => c.name.trim().toLowerCase()))
  const availableTemplates = templates.filter((t) => !existingColumnNames.has(t.name.trim().toLowerCase()))

  const visiblePlayers = squadFilter === 'all' ? tripPlayers : tripPlayers.filter((tp) => tp.squad === squadFilter)

  function summarizePlayers(players) {
    const byColumn = {}
    for (const col of expenseColumns) byColumn[col.id] = 0
    let total = 0
    let paid = 0
    let debt = 0
    let overpaid = 0
    for (const tp of players) {
      const r = resultsByTripPlayerId[tp.id]
      if (!r) continue
      for (const col of expenseColumns) byColumn[col.id] += r.byColumn[col.id] ?? 0
      total += r.total
      paid += r.paid
      debt += r.debt
      overpaid += r.overpaid
    }
    return { byColumn, total, paid, debt, overpaid }
  }

  const filteredSummary = calc ? summarizePlayers(visiblePlayers) : null

  // Группы по составам (сопровождающие всегда последними, без состава — в
  // конце отдельным блоком) — сортировка по алфавиту и своя нумерация внутри
  // каждой группы. Когда выбран конкретный фильтр состава, тут всегда будет
  // максимум одна группа — просто нумерация с 1.
  const squadGroups = groupBySquad(visiblePlayers)

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
          {templates.length > 0 && (
            <button className="secondary" onClick={() => setShowTemplatePicker((v) => !v)}>
              {showTemplatePicker ? 'Отмена' : '+ Из стандартного набора'}
            </button>
          )}
          <button className="secondary" onClick={() => openNewColumnForm('computed')}>
            + Расчётная статья
          </button>
          <button className="secondary" onClick={() => openNewColumnForm('manual')}>
            + Произвольная статья
          </button>
        </div>
      </div>

      {showTemplatePicker && (
        <div className="card">
          {availableTemplates.length === 0 ? (
            <p className="hint" style={{ marginTop: 0 }}>
              Все статьи из стандартного набора уже добавлены в эту поездку.
            </p>
          ) : (
            <>
              <p className="hint" style={{ marginTop: 0 }}>
                Отметь, что нужно добавить — появится пустым, суммы и участников впишешь как обычно. Уже
                добавленные в эту поездку статьи в списке не показаны.
              </p>
              <div className="template-checkbox-row">
                {availableTemplates.map((t) => (
                  <label key={t.id} className="template-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedTemplateIds.has(t.id)}
                      onChange={() => toggleTemplateSelection(t.id)}
                    />
                    {t.name}
                  </label>
                ))}
              </div>
              <button
                style={{ marginTop: 12 }}
                onClick={addSelectedTemplates}
                disabled={addingTemplates || selectedTemplateIds.size === 0}
              >
                {addingTemplates ? 'Добавляем...' : 'Добавить отмеченные'}
              </button>
            </>
          )}
        </div>
      )}

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
        <>
          <p className="hint" style={{ marginTop: 0 }}>
            Стрелками ↑/↓ можно менять порядок статей — в таком же порядке столбцы выстроятся и в большой
            таблице по игрокам ниже.
          </p>
          <table className="players-table">
          <thead>
            <tr>
              <th></th>
              <th>Статья</th>
              <th>Тип</th>
              <th>Дата</th>
              <th>Сумма всего</th>
              <th>Участников</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {expenseColumns.map((col, index) => {
              const isEditing = editingColumnId === col.id
              const count = (participantsByColumn.get(col.id) || new Set()).size
              if (isEditing) {
                return (
                  <tr key={col.id} className="editing-row">
                    <td></td>
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
                  <td className="reorder-cell">
                    <button
                      className="secondary"
                      onClick={() => moveColumn(index, -1)}
                      disabled={index === 0}
                      title="Переместить вверх"
                    >
                      ↑
                    </button>
                    <button
                      className="secondary"
                      onClick={() => moveColumn(index, 1)}
                      disabled={index === expenseColumns.length - 1}
                      title="Переместить вниз"
                    >
                      ↓
                    </button>
                  </td>
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
                        заполнить:{' '}
                        <select
                          className="note-input"
                          style={{ width: 130, display: 'inline-block' }}
                          value={fillTargetDraft[col.id] || 'all'}
                          onChange={(e) => setFillTargetDraft((d) => ({ ...d, [col.id]: e.target.value }))}
                        >
                          <option value="all">всем</option>
                          {SQUADS.map((sq) => (
                            <option key={sq} value={sq}>
                              {sq}
                            </option>
                          ))}
                        </select>
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
        </>
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

      {tripPlayers.length > 0 && (
        <>
          <div className="squad-filter">
            <button
              className={squadFilter === 'all' ? 'active' : 'secondary'}
              onClick={() => setSquadFilter('all')}
            >
              Все ({tripPlayers.length})
            </button>
            {SQUADS.map((sq) => (
              <button
                key={sq}
                className={squadFilter === sq ? 'active' : 'secondary'}
                onClick={() => setSquadFilter(sq)}
              >
                {sq} ({tripPlayers.filter((tp) => tp.squad === sq).length})
              </button>
            ))}
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Внести оплату сразу нескольким игрокам</h3>
            <form onSubmit={bulkAddPayment} className="bulk-payment-row">
              <label>
                Кому
                <select
                  value={bulkPaymentForm.squad}
                  onChange={(e) => setBulkPaymentForm({ ...bulkPaymentForm, squad: e.target.value })}
                >
                  <option value="all">Всем игрокам поездки</option>
                  {SQUADS.map((sq) => (
                    <option key={sq} value={sq}>
                      {sq}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Сумма, ₽
                <input
                  type="number"
                  value={bulkPaymentForm.amount}
                  onChange={(e) => setBulkPaymentForm({ ...bulkPaymentForm, amount: e.target.value })}
                />
              </label>
              <label>
                Дата
                <input
                  type="date"
                  value={bulkPaymentForm.paid_at}
                  onChange={(e) => setBulkPaymentForm({ ...bulkPaymentForm, paid_at: e.target.value })}
                />
              </label>
              <label>
                Комментарий
                <input
                  value={bulkPaymentForm.note}
                  onChange={(e) => setBulkPaymentForm({ ...bulkPaymentForm, note: e.target.value })}
                />
              </label>
              <button type="submit" disabled={bulkSaving}>
                {bulkSaving ? 'Сохраняем...' : 'Внести платёж всем'}
              </button>
            </form>
            <p className="hint" style={{ marginTop: 8 }}>
              Каждому игроку из выбранной группы добавится одинаковый платёж на эту сумму и дату — потом при
              необходимости можно поправить или удалить отдельным игрокам через «Оплачено» в таблице.
            </p>
          </div>
        </>
      )}

      {expenseColumns.length === 0 ? (
        tripPlayers.length === 0 ? (
          <p className="hint">Сначала добавь хотя бы одну статью расходов выше — тогда появится таблица по игрокам.</p>
        ) : (
          <>
            <p className="hint">
              Статей расходов ещё нет — пока просто список игроков поездки. Таблица с расходами появится,
              как только добавишь хотя бы одну статью выше.
            </p>
            <table className="players-table">
              <thead>
                <tr>
                  <th>№</th>
                  <th>ФИО</th>
                  <th>Состав</th>
                  <th>Приезд</th>
                  <th>Отъезд</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {squadGroups.map((group) => (
                  <Fragment key={group.name}>
                    {squadGroups.length > 1 && (
                      <tr className="squad-group-header">
                        <td colSpan={6}>{group.name}</td>
                      </tr>
                    )}
                    {group.players.map((tp, idx) => (
                      <tr key={tp.id}>
                        <td className="num-cell">{idx + 1}</td>
                        <td>
                          <Link to={`/players/${tp.player_id}`}>{tp.full_name}</Link>
                        </td>
                        <td>
                          <select value={tp.squad || ''} onChange={(e) => saveSquad(tp, e.target.value)}>
                            <option value="">—</option>
                            {SQUADS.map((sq) => (
                              <option key={sq} value={sq}>
                                {sq}
                              </option>
                            ))}
                          </select>
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
                        <td>
                          <button className="danger" onClick={() => removeFromTrip(tp)}>
                            Убрать
                          </button>
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </>
        )
      ) : (
        <div className="table-scroll">
          <table className="players-table">
            <thead>
              <tr>
                <th>№</th>
                <th className="sticky-col">ФИО</th>
                <th>Состав</th>
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
              {squadGroups.map((group) => (
                <Fragment key={group.name}>
                  {squadGroups.length > 1 && (
                    <tr className="squad-group-header">
                      <td colSpan={10 + expenseColumns.length}>{group.name}</td>
                    </tr>
                  )}
                  {group.players.map((tp, idx) => {
                const r = resultsByTripPlayerId[tp.id]
                const isPaymentsOpen = expandedPaymentsFor === tp.id
                const rowNum = idx + 1
                return (
                  <Fragment key={tp.id}>
                    <tr>
                      <td className="num-cell">{rowNum}</td>
                      <td className="sticky-col">
                        <Link to={`/players/${tp.player_id}`}>{tp.full_name}</Link>
                      </td>
                      <td>
                        <select value={tp.squad || ''} onChange={(e) => saveSquad(tp, e.target.value)}>
                          <option value="">—</option>
                          {SQUADS.map((sq) => (
                            <option key={sq} value={sq}>
                              {sq}
                            </option>
                          ))}
                        </select>
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
                        <td colSpan={10 + expenseColumns.length}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <b>Платежи — {tp.full_name}</b>
                            <button className="secondary" onClick={() => setExpandedPaymentsFor(null)}>
                              ✕ Закрыть
                            </button>
                          </div>
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
                  {squadGroups.length > 1 && (() => {
                    const gs = summarizePlayers(group.players)
                    return (
                      <tr className="group-summary-row">
                        <td colSpan={5} className="sticky-col">
                          Итого — {group.name}
                        </td>
                        {expenseColumns.map((col) => (
                          <td key={col.id}>{gs.byColumn[col.id] ?? 0}</td>
                        ))}
                        <td className="total-cell">{gs.total}</td>
                        <td>{gs.paid}</td>
                        <td>{gs.debt}</td>
                        <td>{gs.overpaid}</td>
                        <td></td>
                      </tr>
                    )
                  })()}
                </Fragment>
              ))}
              {filteredSummary && (
                <tr className="summary-row">
                  <td colSpan={5} className="sticky-col">
                    ИТОГО {squadFilter === 'all' ? 'по поездке' : `— ${squadFilter}`}
                  </td>
                  {expenseColumns.map((col) => (
                    <td key={col.id}>{filteredSummary.byColumn[col.id] ?? 0}</td>
                  ))}
                  <td className="total-cell">{filteredSummary.total}</td>
                  <td>{filteredSummary.paid}</td>
                  <td>{filteredSummary.debt}</td>
                  <td>{filteredSummary.overpaid}</td>
                  <td></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <h3>Добавить игрока в поездку</h3>
      <div className="card">
        <div className="bulk-add-squad-row">
          <span className="muted">Добавить сразу весь состав:</span>
          {SQUADS.map((sq) => (
            <button key={sq} type="button" className="secondary" onClick={() => bulkAddFromSquad(sq)}>
              + {sq}
            </button>
          ))}
        </div>
        <p className="hint" style={{ marginTop: 0 }}>
          Добавятся все, у кого этот состав указан «по умолчанию» на странице «Состав» и кого ещё нет в
          этой поездке — уточнить каждому отдельно можно потом прямо в таблице.
        </p>

        <label>
          Из общего состава
          <select onChange={(e) => addExistingPlayer(e.target.value)} value="">
            <option value="">— выбрать —</option>
            {rosterNotInTrip.map((rp) => (
              <option key={rp.id} value={rp.id}>
                {rp.full_name}
                {rp.default_squad ? ` (${rp.default_squad})` : ''}
              </option>
            ))}
          </select>
        </label>
        <p className="hint" style={{ marginTop: 4 }}>
          Состав подставится сам, если у игрока задан состав по умолчанию (страница «Состав») — дальше
          его можно поменять прямо в таблице этой поездки, на сам «умолчательный» состав это не повлияет.
        </p>

        <form onSubmit={addNewPlayer} style={{ marginTop: 16 }}>
          <div className="grid">
            <label>
              Новый игрок (ФИО) — добавится и в общий состав
              <input value={addPlayerName} onChange={(e) => setAddPlayerName(e.target.value)} />
            </label>
            <label>
              В какой состав (необязательно)
              <select value={addSquad} onChange={(e) => setAddSquad(e.target.value)}>
                <option value="">— не указан —</option>
                {SQUADS.map((sq) => (
                  <option key={sq} value={sq}>
                    {sq}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button type="submit" style={{ marginTop: 8 }}>
            Добавить нового
          </button>
        </form>
      </div>

      <p className="hint">
        Клик по ячейке расчётной статьи включает/выключает игрока в ней — сумма делится поровну между
        включёнными и округляется вверх до целого рубля. Произвольные статьи — просто впиши число, оно
        сохранится, когда уберёшь курсор из поля. «Оплачено» — кнопка со списком платежей по датам, клик
        открывает/закрывает список под строкой, крестик в панели платежей закрывает её обратно. Состав у
        игрока — только для этой поездки, в другой поездке можно выбрать другой (кнопки-фильтры и итоговая
        строка выше учитывают выбранный состав).
      </p>
    </div>
  )
}
