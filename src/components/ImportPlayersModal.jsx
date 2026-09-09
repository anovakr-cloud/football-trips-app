import { useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../supabaseClient'

const COL_NAME = 'ФИО'
const COL_BIRTHDATE = 'Дата рождения'
const COL_ARRIVAL = 'Дата приезда'
const COL_DEPARTURE = 'Дата отъезда'
const COL_TRAVEL = 'Проезд'

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

export default function ImportPlayersModal({ tripId, startOrder, onDone, onCancel }) {
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
            birth_date: formatDateForDb(r[COL_BIRTHDATE]),
            arrival_date: formatDateForDb(r[COL_ARRIVAL]),
            departure_date: formatDateForDb(r[COL_DEPARTURE]),
            travel_cost: Number(r[COL_TRAVEL]) || 0,
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
    const toInsert = rows.map((r, i) => ({
      trip_id: tripId,
      full_name: r.full_name,
      birth_date: r.birth_date,
      travel_cost: r.travel_cost,
      arrival_date: r.arrival_date,
      departure_date: r.departure_date,
      adjustment: 0,
      sort_order: startOrder + i,
    }))
    const { error } = await supabase.from('players').insert(toInsert)
    setImporting(false)
    if (error) {
      setError('Ошибка сохранения: ' + error.message)
      return
    }
    onDone()
  }

  return (
    <div className="card">
      <h3>Импорт игроков из Excel/CSV</h3>
      <p className="hint">
        Первая строка файла — заголовки столбцов. Обязательный столбец: <b>{COL_NAME}</b>.
        Необязательные: <b>{COL_BIRTHDATE}</b>, <b>{COL_ARRIVAL}</b>, <b>{COL_DEPARTURE}</b>{' '}
        (формат ДД.ММ.ГГГГ или дата из Excel — если у игрока даты приезда/отъезда совпадают
        с общими датами поездки, оставьте пусто), <b>{COL_TRAVEL}</b> (число, руб — если
        планируете нажать «Разделить дорогу поровну» после импорта, можно оставить пустым).
        Лишние столбцы игнорируются. Названия столбцов должны совпадать точно, как здесь
        написано.
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
                <th>Дата рождения</th>
                <th>Приезд</th>
                <th>Отъезд</th>
                <th>Проезд</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.full_name}</td>
                  <td>{r.birth_date || '—'}</td>
                  <td>{r.arrival_date || '—'}</td>
                  <td>{r.departure_date || '—'}</td>
                  <td>{r.travel_cost}</td>
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
