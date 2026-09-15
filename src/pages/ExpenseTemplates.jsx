import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useClub } from '../ClubContext'

export default function ExpenseTemplates() {
  const { currentClub } = useClub()
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
      .eq('club_id', currentClub.id)
      .order('sort_order', { ascending: true })
    if (!error) setTemplates(data || [])
    setLoading(false)
  }

  useEffect(() => {
    loadTemplates()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentClub.id])

  async function addTemplate(e) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    setError('')
    const { error } = await supabase.from('expense_column_templates').insert({
      club_id: currentClub.id,
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

  async function moveTemplate(index, direction) {
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= templates.length) return
    // Перенумеровываем sort_order у ВСЕХ статей подряд (0..N-1), а не просто
    // меняем местами два старых значения — после удалений/добавлений статьи
    // могли задвоиться по sort_order, и точечный обмен тогда визуально ничего
    // не менял. Перенумерация чинит порядок навсегда, даже если он уже был
    // "сбит" раньше.
    const reordered = [...templates]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(targetIndex, 0, moved)
    setError('')
    const results = await Promise.all(
      reordered.map((t, i) => supabase.from('expense_column_templates').update({ sort_order: i }).eq('id', t.id))
    )
    const failed = results.find((r) => r.error)
    if (failed) {
      setError('Ошибка изменения порядка: ' + failed.error.message)
      return
    }
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
              <th></th>
              <th>Название</th>
              <th>Тип</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {templates.map((t, index) => {
              const isEditing = editingId === t.id
              if (isEditing) {
                return (
                  <tr key={t.id} className="editing-row">
                    <td></td>
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
                  <td className="reorder-cell">
                    <button
                      className="secondary"
                      onClick={() => moveTemplate(index, -1)}
                      disabled={index === 0}
                      title="Переместить вверх"
                    >
                      ↑
                    </button>
                    <button
                      className="secondary"
                      onClick={() => moveTemplate(index, 1)}
                      disabled={index === templates.length - 1}
                      title="Переместить вниз"
                    >
                      ↓
                    </button>
                  </td>
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
