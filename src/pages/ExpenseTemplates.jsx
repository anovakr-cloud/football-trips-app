import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'

export default function ExpenseTemplates() {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [newName, setNewName] = useState('')
  const [newKind, setNewKind] = useState('manual')

  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({ name: '', kind: 'manual' })

  async function loadTemplates() {
    setLoading(true)
    const { data, error } = await supabase
      .from('expense_column_templates')
      .select('*')
      .order('sort_order', { ascending: true })
    if (!error) setTemplates(data || [])
    setLoading(false)
  }

  useEffect(() => {
    loadTemplates()
  }, [])

  async function addTemplate(e) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    setError('')
    const { error } = await supabase.from('expense_column_templates').insert({
      name,
      kind: newKind,
      sort_order: templates.length,
    })
    if (error) {
      setError('Ошибка добавления: ' + error.message)
      return
    }
    setNewName('')
    setNewKind('manual')
    loadTemplates()
  }

  function startEdit(t) {
    setEditingId(t.id)
    setEditForm({ name: t.name, kind: t.kind })
  }

  async function saveEdit(t) {
    const name = editForm.name.trim()
    if (!name) return
    const { error } = await supabase
      .from('expense_column_templates')
      .update({ name, kind: editForm.kind })
      .eq('id', t.id)
    if (error) {
      setError('Ошибка сохранения: ' + error.message)
      return
    }
    setEditingId(null)
    loadTemplates()
  }

  async function deleteTemplate(t) {
    if (!confirm(`Удалить статью «${t.name}» из стандартного набора? На уже созданные поездки это не повлияет — там эта статья (если добавлялась) останется как есть.`)) return
    await supabase.from('expense_column_templates').delete().eq('id', t.id)
    loadTemplates()
  }

  return (
    <div className="page">
      <p>
        <Link to="/">← Все поездки</Link>
      </p>
      <div className="page-header">
        <h1>Стандартные статьи</h1>
      </div>
      <p className="hint">
        Список статей расходов, которые можно отметить галочками при создании новой поездки — чтобы не
        вбивать одни и те же названия заново каждый раз. Это просто шаблон названий и типа статьи (без
        сумм) — на уже существующие поездки изменения здесь не влияют. Тип «расчётная» — общая сумма
        делится между отмеченными участниками, «произвольная» — значение вписывается вручную по каждому
        игроку. Сумму и участников по каждой поездке всё равно указываешь отдельно на её странице.
      </p>

      {error && <p className="error">{error}</p>}

      <form className="card" onSubmit={addTemplate}>
        <div className="grid">
          <label>
            Название статьи
            <input value={newName} onChange={(e) => setNewName(e.target.value)} />
          </label>
          <label>
            Тип
            <select value={newKind} onChange={(e) => setNewKind(e.target.value)}>
              <option value="manual">произвольная</option>
              <option value="computed">расчётная</option>
            </select>
          </label>
        </div>
        <button type="submit" style={{ marginTop: 8 }}>
          Добавить
        </button>
      </form>

      {loading ? (
        <p>Загрузка...</p>
      ) : templates.length === 0 ? (
        <p>Стандартный набор пока пуст.</p>
      ) : (
        <table className="trips-table">
          <thead>
            <tr>
              <th>Название</th>
              <th>Тип</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => {
              const isEditing = editingId === t.id
              if (isEditing) {
                return (
                  <tr key={t.id} className="editing-row">
                    <td>
                      <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                    </td>
                    <td>
                      <select value={editForm.kind} onChange={(e) => setEditForm({ ...editForm, kind: e.target.value })}>
                        <option value="manual">произвольная</option>
                        <option value="computed">расчётная</option>
                      </select>
                    </td>
                    <td>
                      <button onClick={() => saveEdit(t)}>Сохранить</button>
                      <button className="secondary" onClick={() => setEditingId(null)}>
                        Отмена
                      </button>
                    </td>
                  </tr>
                )
              }
              return (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td className="muted">{t.kind === 'computed' ? 'расчётная' : 'произвольная'}</td>
                  <td>
                    <button className="secondary" onClick={() => startEdit(t)}>
                      Изм.
                    </button>
                    <button className="danger" onClick={() => deleteTemplate(t)}>
                      Удалить
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
