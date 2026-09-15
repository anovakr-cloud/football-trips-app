import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'

export default function PlayersList() {
  const [players, setPlayers] = useState([])
  const [squads, setSquads] = useState([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [newDefaultSquad, setNewDefaultSquad] = useState('')
  const [error, setError] = useState('')

  async function loadPlayers() {
    setLoading(true)
    const { data, error } = await supabase.from('roster_players').select('*').order('full_name', { ascending: true })
    if (!error) setPlayers(data || [])
    setLoading(false)
  }

  async function loadSquads() {
    const { data } = await supabase.from('squads').select('*').order('sort_order', { ascending: true })
    setSquads(data || [])
  }

  useEffect(() => {
    loadPlayers()
    loadSquads()
  }, [])

  async function addPlayer(e) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    const dup = players.find((p) => p.full_name.trim().toLowerCase() === name.toLowerCase())
    if (dup) {
      if (
        !confirm(
          `Игрок с именем «${dup.full_name}» уже есть в составе. Добавить ещё одного с таким же именем (это будет отдельный, самостоятельный игрок)?`
        )
      ) {
        return
      }
    }
    setError('')
    const { error } = await supabase.from('roster_players').insert({ full_name: name, default_squad: newDefaultSquad || null })
    if (error) {
      setError('Ошибка добавления: ' + error.message)
      return
    }
    setNewName('')
    setNewDefaultSquad('')
    loadPlayers()
  }

  async function deletePlayer(p) {
    if (!confirm(`Удалить ${p.full_name} из состава совсем? Он пропадёт из всех поездок, где участвовал, вместе со своими расходами и платежами.`)) return
    await supabase.from('roster_players').delete().eq('id', p.id)
    loadPlayers()
  }

  async function saveDefaultSquad(p, value) {
    await supabase.from('roster_players').update({ default_squad: value || null }).eq('id', p.id)
    loadPlayers()
  }

  return (
    <div className="page">
      <p>
        <Link to="/">← Все поездки</Link>
      </p>
      <div className="page-header">
        <h1>Состав</h1>
      </div>
      <p className="hint">
        Общий список игроков команды — на каждого ведётся сквозной учёт по всем поездкам. «Состав по
        умолчанию» — просто удобство: он сам подставится, когда добавляешь игрока в новую поездку, но
        внутри самой поездки его всегда можно поменять отдельно, не трогая эту настройку.
      </p>

      {error && <p className="error">{error}</p>}

      <form className="card" onSubmit={addPlayer}>
        <div className="grid">
          <label>
            Добавить игрока в состав (ФИО)
            <input value={newName} onChange={(e) => setNewName(e.target.value)} />
          </label>
          <label>
            Состав по умолчанию (необязательно)
            <select value={newDefaultSquad} onChange={(e) => setNewDefaultSquad(e.target.value)}>
              <option value="">— не указан —</option>
              {squads.map((sq) => (
                <option key={sq.id} value={sq.name}>
                  {sq.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button type="submit" style={{ marginTop: 8 }}>
          Добавить
        </button>
      </form>

      {loading ? (
        <p>Загрузка...</p>
      ) : players.length === 0 ? (
        <p>В составе пока никого нет.</p>
      ) : (
        <table className="trips-table">
          <thead>
            <tr>
              <th>№</th>
              <th>ФИО</th>
              <th>Состав по умолчанию</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {players.map((p, idx) => (
              <tr key={p.id}>
                <td className="num-cell">{idx + 1}</td>
                <td>
                  <Link to={`/players/${p.id}`}>{p.full_name}</Link>
                </td>
                <td>
                  <select value={p.default_squad || ''} onChange={(e) => saveDefaultSquad(p, e.target.value)}>
                    <option value="">— не указан —</option>
                    {squads.map((sq) => (
                      <option key={sq.id} value={sq.name}>
                        {sq.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <button className="danger" onClick={() => deletePlayer(p)}>
                    Удалить
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
