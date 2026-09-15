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

  const [templates, setTemplates] = useState([])
  const [selectedTemplateIds, setSelectedTemplateIds] = useState(new Set())

  async function loadTrips() {
    setLoading(true)
    const { data, error } = await supabase.from('trips').select('*').order('start_date', { ascending: false })
    if (!error) setTrips(data)
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
    loadTrips()
    loadTemplates()
  }, [])

  function toggleTemplate(id) {
    setSelectedTemplateIds((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleCreate(e) {
    e.preventDefault()
    setError('')
    if (!form.name || !form.start_date || !form.end_date) {
      setError('Заполните название и даты поездки')
      return
    }
    setSaving(true)
    const { data: trip, error } = await supabase
      .from('trips')
      .insert({
        name: form.name,
        start_date: form.start_date,
        end_date: form.end_date,
        notes: form.notes || null,
      })
      .select()
      .single()
    if (error) {
      setSaving(false)
      setError('Ошибка сохранения: ' + error.message)
      return
    }

    const chosen = templates.filter((t) => selectedTemplateIds.has(t.id))
    if (chosen.length > 0) {
      const rows = chosen.map((t, i) => ({
        trip_id: trip.id,
        name: t.name,
        kind: t.kind,
        total_amount: t.kind === 'computed' ? 0 : null,
        sort_order: i,
      }))
      const { error: colErr } = await supabase.from('expense_columns').insert(rows)
      if (colErr) {
        setSaving(false)
        setError('Поездка создана, но не удалось добавить стандартные статьи: ' + colErr.message)
        return
      }
    }

    setSaving(false)
    setForm({ name: '', start_date: '', end_date: '', notes: '' })
    setSelectedTemplateIds(new Set())
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
          <Link to="/squads">
            <button className="secondary">Составы</button>
          </Link>
          <Link to="/expense-templates">
            <button className="secondary">Стандартные статьи</button>
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
          {templates.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <label style={{ marginBottom: 4 }}>Статьи расходов из стандартного набора (необязательно)</label>
              <div className="template-checkbox-row">
                {templates.map((t) => (
                  <label key={t.id} className="template-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedTemplateIds.has(t.id)}
                      onChange={() => toggleTemplate(t.id)}
                    />
                    {t.name}
                  </label>
                ))}
              </div>
              <p className="hint" style={{ marginTop: 4 }}>
                Отмеченные статьи сразу появятся в поездке пустыми — суммы и участников впишешь на её
                странице. Список можно менять на странице «Стандартные статьи».
              </p>
            </div>
          )}
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={saving} style={{ marginTop: 8 }}>
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
