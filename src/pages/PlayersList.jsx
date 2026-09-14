import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'

export default function PlayersList() {
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [error, setError] = useState('')

  async function loadPlayers() {
    setLoading(true)
    const { data, error } = await supabase.from('roster_players').select('*').order('full_name', { ascending: true })
    if (!error) setPlayers(data || [])
    setLoading(false)
  }

  useEffect(() => {
    loadPlayers()
  }, [])

  async function addPlayer(e) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    setError('')
    const { error } = await supabase.from('roster_players').insert({ full_name: name })
    if (error) {
      setError('Ошибка добавления: ' + error.message)
      return
    }
    setNewName('')
    loadPlayers()
  }

  async function deletePlayer(p) {
    if (!confirm(`Удалить ${p.full_name} из состава совсем? Он пропадёт из всех поездок, где участвовал, вместе со своими расходами и платежами.`)) return
    await supabase.from('roster_players').delete().eq('id', p.id)
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
      <p className="hint">Общий список игроков команды — на каждого ведётся сквозной учёт по всем поездкам.</p>

      {error && <p className="error">{error}</p>}

      <form className="card" onSubmit={addPlayer}>
        <label>
          Добавить игрока в состав (ФИО)
          <input value={newName} onChange={(e) => setNewName(e.target.value)} />
        </label>
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
              <th>ФИО</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link to={`/players/${p.id}`}>{p.full_name}</Link>
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
