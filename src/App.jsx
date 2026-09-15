import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { supabase } from './supabaseClient'
import Login from './pages/Login'
import TripsList from './pages/TripsList'
import TripDetail from './pages/TripDetail'
import PlayersList from './pages/PlayersList'
import PlayerCard from './pages/PlayerCard'
import ExpenseTemplates from './pages/ExpenseTemplates'
import CashWidget from './components/CashWidget'

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
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<TripsList />} />
        <Route path="/trips/:tripId" element={<TripDetail />} />
        <Route path="/players" element={<PlayersList />} />
        <Route path="/players/:playerId" element={<PlayerCard />} />
        <Route path="/expense-templates" element={<ExpenseTemplates />} />
      </Routes>
      <CashWidget />
    </BrowserRouter>
  )
}
