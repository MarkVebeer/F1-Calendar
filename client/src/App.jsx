import { useEffect, useState } from 'react'
import Calendar from './Calendar'
import AdminPanel from './AdminPanel'
import DiscordDashboard from './DiscordDashboard'

function readView() {
  const { hash } = window.location
  if (hash === '#admin') return 'admin'
  if (hash === '#discord') return 'discord'
  return 'calendar'
}

// The public calendar, plus the admin panel (#admin) and the Discord dashboard (#discord).
function App() {
  const [view, setView] = useState(readView)

  useEffect(() => {
    const onHashChange = () => setView(readView())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  if (view === 'admin') return <AdminPanel />
  if (view === 'discord') return <DiscordDashboard />
  return <Calendar />
}

export default App
