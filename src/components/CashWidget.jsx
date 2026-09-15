import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { roundUp } from '../calc'

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

// Плавающий виджет в углу экрана — общая касса клуба (не привязана к
// конкретной поездке или составу). Показывается на всех страницах.
export default function CashWidget() {
  const [open, setOpen] = useState(false)
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ kind: 'deposit', amount: '', entry_date: todayStr(), note: '' })

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('cash_ledger')
      .select('*')
      .order('entry_date', { ascending: false })
      .order('created_at', { ascending: false })
    if (!error) setEntries(data || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const balance = entries.reduce((s, e) => s + (e.kind === 'deposit' ? Number(e.amount) : -Number(e.amount)), 0)

  async function addEntry(e) {
    e.preventDefault()
    const amount = roundUp(Number(form.amount) || 0)
    if (!amount) {
      setError('Укажите сумму')
      return
    }
    setError('')
    setSaving(true)
    const { error } = await supabase.from('cash_ledger').insert({
      kind: form.kind,
      amount,
      entry_date: form.entry_date || todayStr(),
      note: form.note || null,
    })
    setSaving(false)
    if (error) {
      setError('Ошибка сохранения: ' + error.message)
      return
    }
    setForm({ kind: 'deposit', amount: '', entry_date: todayStr(), note: '' })
    load()
  }

  async function deleteEntry(id) {
    if (!confirm('Удалить эту запись?')) return
    await supabase.from('cash_ledger').delete().eq('id', id)
    load()
  }

  if (!open) {
    return (
      <button className="cash-widget-pill" onClick={() => setOpen(true)} title="Касса клуба">
        💰 Касса: {loading ? '…' : `${balance} ₽`}
      </button>
    )
  }

  return (
    <div className="cash-widget-panel">
      <div className="cash-widget-header">
        <b>Касса клуба</b>
        <button className="secondary" onClick={() => setOpen(false)}>
          ✕
        </button>
      </div>
      <p className="cash-widget-balance">
        Остаток: <b>{loading ? '…' : `${balance} ₽`}</b>
      </p>

      <form onSubmit={addEntry} className="cash-widget-form">
        <div className="cash-widget-row">
          <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            <option value="deposit">Приход</option>
            <option value="expense">Расход</option>
          </select>
          <input
            type="number"
            placeholder="сумма"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
          />
        </div>
        <div className="cash-widget-row">
          <input type="date" value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} />
          <input
            placeholder="комментарий"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
        </div>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={saving}>
          {saving ? 'Сохраняем...' : 'Добавить'}
        </button>
      </form>

      <div className="cash-widget-history">
        {entries.length === 0 ? (
          <p className="muted">Пока пусто</p>
        ) : (
          entries.slice(0, 20).map((e) => (
            <div key={e.id} className="cash-widget-entry">
              <span className={e.kind === 'deposit' ? 'cash-in' : 'cash-out'}>
                {e.kind === 'deposit' ? '+' : '−'}
                {e.amount} ₽
              </span>
              <span className="muted">{e.entry_date}</span>
              <span className="muted cash-widget-note">{e.note || ''}</span>
              <button className="danger" onClick={() => deleteEntry(e.id)}>
                ×
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
