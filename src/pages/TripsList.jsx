import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'

export default function TripsList() {
  const [trips, setTrips] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', start_date: '', end_date: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function loadTrips() {
    setLoading(true)
    const { data, error } = await supabase.from('trips').select('*').order('start_date', { ascending: false })
    if (!error) setTrips(data)
    setLoading(false)
  }

  useEffect(() => {
    loadTrips()
  }, [])

  async function handleCreate(e) {
    e.preventDefault()
    setError('')
    if (!form.name || !form.start_date || !form.end_date) {
      setError('Заполните название и даты поездки')
      return
    }
    setSaving(true)
    const { error } = await supabase.from('trips').insert({
      name: form.name,
      start_date: form.start_date,
      end_date: form.end_date,
      notes: form.notes || null,
    })
    setSaving(false)
    if (error) {
      setError('Ошибка сохранения: ' + error.message)
      return
    }
    setForm({ name: '', start_date: '', end_date: '', notes: '' })
    setShowForm(false)
    loadTrips()
  }

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Поездки</h1>
        <div>
          <Link to="/players">
            <button className="secondary">Состав</button>
          </Link>
          <button onClick={() => setShowForm((v) => !v)}>{showForm ? 'Отмена' : '+ Новая поездка'}</button>
          <button className="secondary" onClick={handleLogout}>
            Выйти
          </button>
        </div>
      </div>

      {showForm && (
        <form className="card" onSubmit={handleCreate}>
          <div className="grid">
            <label>
              Название поездки
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Например: Турнир в Казани, сентябрь 2026"
              />
            </label>
            <label>
              Дата начала
              <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            </label>
            <label>
              Дата окончания
              <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
            </label>
            <label>
              Заметка (необязательно)
              <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </label>
          </div>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={saving}>
            {saving ? 'Сохраняем...' : 'Создать поездку'}
          </button>
        </form>
      )}

      <p className="hint">
        Статьи расходов (питание, дорога, тренерские и любые другие) задаются отдельно для каждой поездки —
        на её собственной странице, после создания.
      </p>

      {loading ? (
        <p>Загрузка...</p>
      ) : trips.length === 0 ? (
        <p>Пока нет ни одной поездки. Создайте первую.</p>
      ) : (
        <table className="trips-table">
          <thead>
            <tr>
              <th>Название</th>
              <th>Даты</th>
              <th>Заметка</th>
            </tr>
          </thead>
          <tbody>
            {trips.map((t) => (
              <tr key={t.id}>
                <td>
                  <Link to={`/trips/${t.id}`}>{t.name}</Link>
                </td>
                <td>
                  {t.start_date} — {t.end_date}
                </td>
                <td className="muted">{t.notes || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
