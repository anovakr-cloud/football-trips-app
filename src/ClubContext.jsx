import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

const ClubContext = createContext(null)

// Выбранный клуб храним в localStorage отдельно на каждого пользователя
// (на случай, если разные люди из комитета заходят с одного компьютера) —
// чтобы при следующем входе не приходилось выбирать заново.
function storageKey(session) {
  return `currentClubId:${session?.user?.id || 'anon'}`
}

export function ClubProvider({ session, children }) {
  const [clubs, setClubs] = useState([])
  const [currentClubId, setCurrentClubIdState] = useState(() => localStorage.getItem(storageKey(session)))
  const [loading, setLoading] = useState(true)

  const loadClubs = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('club_members')
      .select('club_id, clubs(id, name, sort_order, logo_url)')
    if (!error) {
      const list = (data || [])
        .map((row) => row.clubs)
        .filter(Boolean)
        .sort((a, b) => a.sort_order - b.sort_order)
      setClubs(list)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadClubs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function selectClub(id) {
    setCurrentClubIdState(id)
    if (id) localStorage.setItem(storageKey(session), id)
    else localStorage.removeItem(storageKey(session))
  }

  // Если клуб только один — выбираем его сразу, без лишнего экрана выбора.
  // Если раньше выбранный клуб пропал из списка (удалили/доступ убрали) —
  // сбрасываем выбор, чтобы не зависнуть на несуществующем клубе.
  useEffect(() => {
    if (loading) return
    if (currentClubId && !clubs.some((c) => c.id === currentClubId)) {
      selectClub(null)
      return
    }
    if (!currentClubId && clubs.length === 1) {
      selectClub(clubs[0].id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubs, loading])

  const currentClub = clubs.find((c) => c.id === currentClubId) || null

  return (
    <ClubContext.Provider value={{ clubs, currentClub, currentClubId, selectClub, loading, reloadClubs: loadClubs }}>
      {children}
    </ClubContext.Provider>
  )
}

export function useClub() {
  const ctx = useContext(ClubContext)
  if (!ctx) throw new Error('useClub must be used within ClubProvider')
  return ctx
}
