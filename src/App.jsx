import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import { ClubProvider, useClub } from './ClubContext'
import Login from './pages/Login'
import ClubPicker from './pages/ClubPicker'
import TripsList from './pages/TripsList'
import TripDetail from './pages/TripDetail'
import PlayersList from './pages/PlayersList'
import PlayerCard from './pages/PlayerCard'
import ExpenseTemplates from './pages/ExpenseTemplates'
import Squads from './pages/Squads'
import CashWidget from './components/CashWidget'

// Едва заметный водяной знак на фоне — логотип текущего выбранного клуба
// (страница «Клубы»), у каждого клуба свой. Пока клуб не выбран — фона нет.
function ClubWatermark() {
  const { currentClub } = useClub()
  useEffect(() => {
    const value = currentClub?.logo_url ? `url("${currentClub.logo_url}")` : 'none'
    document.documentElement.style.setProperty('--club-watermark', value)
  }, [currentClub])
  return null
}

function AuthedApp() {
  const { currentClub, loading } = useClub()

  if (loading) {
    return <div className="page">Загрузка...</div>
  }

  return (
    <BrowserRouter>
      <ClubWatermark />
      <Routes>
        <Route path="/clubs" element={<ClubPicker />} />
        {currentClub ? (
          <>
            <Route path="/" element={<TripsList />} />
            <Route path="/trips/:tripId" element={<TripDetail />} />
            <Route path="/players" element={<PlayersList />} />
            <Route path="/players/:playerId" element={<PlayerCard />} />
            <Route path="/expense-templates" element={<ExpenseTemplates />} />
            <Route path="/squads" element={<Squads />} />
          </>
        ) : (
          <Route path="*" element={<Navigate to="/clubs" replace />} />
        )}
      </Routes>
      {currentClub && <CashWidget />}
    </BrowserRouter>
  )
}

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = ещё проверяем

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  if (session === undefined) {
    return <div className="page">Загрузка...</div>
  }

  if (!session) {
    return <Login />
  }

  return (
    <ClubProvider session={session}>
      <AuthedApp />
    </ClubProvider>
  )
}
