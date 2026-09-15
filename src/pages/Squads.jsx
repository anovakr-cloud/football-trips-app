import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useClub } from '../ClubContext'

export default function Squads() {
  const { currentClub } = useClub()
  const [squads, setSquads] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [newName, setNewName] = useState('')

  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')

  async function loadSquads() {
    setLoading(true)
    const { data, error } = await supabase
      .from('squads')
      .select('*')
      .eq('club_id', currentClub.id)
      .order('sort_order', { ascending: true })
    if (!error) setSquads(data || [])
    setLoading(false)
  }

  useEffect(() => {
    loadSquads()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentClub.id])

  async function addSquad(e) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    setError('')
    const { error } = await supabase.from('squads').insert({ club_id: currentClub.id, name, sort_order: squads.length })
    if (error) {
      setError('Ошибка добавления: ' + error.message)
      return
    }
    setNewName('')
    loadSquads()
  }

  function startEdit(s) {
    setEditingId(s.id)
    setEditName(s.name)
  }

  async function saveEdit(s) {
    const name = editName.trim()
    if (!name) return
    const { error } = await supabase.from('squads').update({ name }).eq('id', s.id)
    if (error) {
      setError('Ошибка сохранения: ' + error.message)
      return
    }
    setEditingId(null)
    loadSquads()
  }

  async function deleteSquad(s) {
    if (
      !confirm(
        `Удалить состав «${s.name}» из списка? На уже созданных поездках и в общем составе игроков это название не тронется — такие игроки просто станут показываться как «Без состава». В фильтрах и кнопках для новых поездок этот состав больше предлагаться не будет.`
      )
    ) {
      return
    }
    await supabase.from('squads').delete().eq('id', s.id)
    loadSquads()
  }

  async function moveSquad(index, direction) {
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= squads.length) return
    const reordered = [...squads]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(targetIndex, 0, moved)
    setError('')
    const results = await Promise.all(
      reordered.map((s, i) => supabase.from('squads').update({ sort_order: i }).eq('id', s.id))
    )
    const failed = results.find((r) => r.error)
    if (failed) {
      setError('Ошибка изменения порядка: ' + failed.error.message)
      return
    }
    loadSquads()
  }

  return (
    <div className="page">
      <p>
        <Link to="/">← Все поездки</Link>
      </p>
      <div className="page-header">
        <h1>Составы</h1>
      </div>
      <p className="hint">
        Список составов — используется и в общем составе игроков (как «состав по умолчанию»), и в каждой
        поездке отдельно (фильтры, массовое добавление, платежи и заполнение статей по составу, группировка
        в таблице и в выгрузке Excel). Порядок в этом списке — это и порядок блоков везде в приложении.
        Удаление состава не трогает уже сохранённые данные игроков — подробности в подтверждении при
        удалении.
      </p>

      {error && <p className="error">{error}</p>}

      <form className="card" onSubmit={addSquad}>
        <div className="grid" style={{ gridTemplateColumns: '1fr' }}>
          <label>
            Название состава
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Например: Состав 3" />
          </label>
        </div>
        <button type="submit" style={{ marginTop: 8 }}>
          Добавить
        </button>
      </form>

      {loading ? (
        <p>Загрузка...</p>
      ) : squads.length === 0 ? (
        <p>Составов пока нет.</p>
      ) : (
        <table className="trips-table">
          <thead>
            <tr>
              <th></th>
              <th>Название</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {squads.map((s, index) => {
              const isEditing = editingId === s.id
              if (isEditing) {
                return (
                  <tr key={s.id} className="editing-row">
                    <td></td>
                    <td>
                      <input value={editName} onChange={(e) => setEditName(e.target.value)} />
                    </td>
                    <td>
                      <button onClick={() => saveEdit(s)}>Сохранить</button>
                      <button className="secondary" onClick={() => setEditingId(null)}>
                        Отмена
                      </button>
                    </td>
                  </tr>
                )
              }
              return (
                <tr key={s.id}>
                  <td className="reorder-cell">
                    <button
                      className="secondary"
                      onClick={() => moveSquad(index, -1)}
                      disabled={index === 0}
                      title="Переместить вверх"
                    >
                      ↑
                    </button>
                    <button
                      className="secondary"
                      onClick={() => moveSquad(index, 1)}
                      disabled={index === squads.length - 1}
                      title="Переместить вниз"
                    >
                      ↓
                    </button>
                  </td>
                  <td>{s.name}</td>
                  <td>
                    <button className="secondary" onClick={() => startEdit(s)}>
                      Изм.
                    </button>
                    <button className="danger" onClick={() => deleteSquad(s)}>
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
