import { useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../supabaseClient'

const COL_NAME = 'ФИО'
const COL_ARRIVAL = 'Дата приезда'
const COL_DEPARTURE = 'Дата отъезда'

function formatDateForDb(value) {
  if (!value && value !== 0) return null
  if (value instanceof Date) {
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, '0')
    const d = String(value.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  const str = String(value).trim()
  if (!str) return null
  const dmy = str.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})$/)
  if (dmy) {
    const [, d, m, y] = dmy
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  const ymd = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (ymd) return str
  return null
}

// tripId, startOrder, existingPlayerIds (Set игроков, уже добавленных в эту
// поездку — такие пропускаются, чтобы не ловить ошибку дубликата), onDone, onCancel
export default function ImportPlayersModal({ tripId, startOrder, existingPlayerIds, onDone, onCancel }) {
  const [rows, setRows] = useState([])
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)
  const [fileName, setFileName] = useState('')

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setFileName(file.name)
    setError('')
    setRows([])
    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result)
        const workbook = XLSX.read(data, { type: 'array', cellDates: true })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const json = XLSX.utils.sheet_to_json(sheet, { defval: '' })

        if (json.length === 0) {
          setError('Файл пустой или не удалось прочитать данные.')
          return
        }
        if (!(COL_NAME in json[0])) {
          setError(`Не найден обязательный столбец "${COL_NAME}" в первой строке файла. Проверьте заголовки.`)
          return
        }

        const parsed = json
          .filter((r) => String(r[COL_NAME] || '').trim() !== '')
          .map((r) => ({
            full_name: String(r[COL_NAME]).trim(),
            arrival_date: formatDateForDb(r[COL_ARRIVAL]),
            departure_date: formatDateForDb(r[COL_DEPARTURE]),
          }))

        if (parsed.length === 0) {
          setError('Не найдено ни одной строки с заполненным ФИО.')
          return
        }
        setRows(parsed)
      } catch (err) {
        setError('Не удалось прочитать файл: ' + err.message)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  async function handleImport() {
    if (rows.length === 0) return
    setImporting(true)
    setError('')

    // Подтягиваем текущий состав, чтобы сопоставить по ФИО (без учёта регистра/пробелов)
    const { data: roster, error: rosterErr } = await supabase.from('roster_players').select('id, full_name')
    if (rosterErr) {
      setImporting(false)
      setError('Ошибка загрузки состава: ' + rosterErr.message)
      return
    }
    const rosterByName = new Map((roster || []).map((rp) => [rp.full_name.trim().toLowerCase(), rp.id]))

    let skipped = 0
    const toInsert = []
    let order = startOrder

    for (const row of rows) {
      const key = row.full_name.trim().toLowerCase()
      let playerId = rosterByName.get(key)
      if (!playerId) {
        const { data: created, error: createErr } = await supabase
          .from('roster_players')
          .insert({ full_name: row.full_name })
          .select()
          .single()
        if (createErr) {
          setImporting(false)
          setError(`Ошибка добавления «${row.full_name}» в состав: ` + createErr.message)
          return
        }
        playerId = created.id
        rosterByName.set(key, playerId)
      }

      if (existingPlayerIds && existingPlayerIds.has(playerId)) {
        skipped += 1
        continue
      }

      toInsert.push({
        trip_id: tripId,
        player_id: playerId,
        arrival_date: row.arrival_date,
        departure_date: row.departure_date,
        sort_order: order++,
      })
    }

    if (toInsert.length > 0) {
      const { error: insErr } = await supabase.from('trip_players').insert(toInsert)
      if (insErr) {
        setImporting(false)
        setError('Ошибка сохранения: ' + insErr.message)
        return
      }
    }

    setImporting(false)
    onDone(skipped)
  }

  return (
    <div className="card">
      <h3>Импорт игроков из Excel/CSV</h3>
      <p className="hint">
        Первая строка файла — заголовки столбцов. Обязательный столбец: <b>{COL_NAME}</b>. Необязательные:{' '}
        <b>{COL_ARRIVAL}</b>, <b>{COL_DEPARTURE}</b> (формат ДД.ММ.ГГГГ или дата из Excel — если у игрока
        даты приезда/отъезда совпадают с общими датами поездки, оставьте пусто). Лишние столбцы игнорируются.
        Игрок ищется в общем составе по ФИО — если такого ещё нет, он автоматически добавится в состав; если
        уже есть в этой поездке — будет пропущен, чтобы не задвоить.
      </p>
      <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} />
      {error && <p className="error">{error}</p>}

      {rows.length > 0 && (
        <>
          <p>
            Найдено игроков: <b>{rows.length}</b> (файл: {fileName})
          </p>
          <table className="players-table">
            <thead>
              <tr>
                <th>ФИО</th>
                <th>Приезд</th>
                <th>Отъезд</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.full_name}</td>
                  <td>{r.arrival_date || '—'}</td>
                  <td>{r.departure_date || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={handleImport} disabled={importing}>
            {importing ? 'Импортируем...' : `Импортировать ${rows.length} игроков`}
          </button>
          <button className="secondary" onClick={onCancel} disabled={importing}>
            Отмена
          </button>
        </>
      )}
      {rows.length === 0 && (
        <button className="secondary" onClick={onCancel}>
          Отмена
        </button>
      )}
    </div>
  )
}
