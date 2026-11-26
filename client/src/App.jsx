import { useEffect } from 'react'
import Calendar from './Calendar'
import AdminPanel from './AdminPanel'
import DiscordDashboard from './DiscordDashboard'

// Three pages: the public calendar (/), the Discord dashboard (/discord) and the admin panel (/admin).
// Links between them are ordinary page loads; the calendar keeps its weekend links in the hash (#/2026/losail).
const PAGES = {
  '/discord': { title: 'Discord reminders · F1 Calendar', Page: DiscordDashboard },
  '/admin': { title: 'Admin · F1 Calendar', Page: AdminPanel }
}

function currentPage() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/'
  return PAGES[path] || null
}

function App() {
  const page = currentPage()

  useEffect(() => {
    if (page) document.title = page.title
  }, [page])

  if (page) return <page.Page />
  return <Calendar />
}

export default App
