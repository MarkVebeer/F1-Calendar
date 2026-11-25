import { useState, useEffect } from 'react'
import axios from 'axios'
import './App.css'
import Calendar from './Calendar'
import BuildInfo from './BuildInfo'

axios.defaults.withCredentials = true

// All available timezones from the runtime
const TIMEZONES = (() => {
  try {
    return Intl.supportedValuesOf('timeZone')
  } catch {
    return ['UTC']
  }
})()

function readView() {
  const { hash } = window.location
  if (hash === '#admin') return 'admin'
  if (hash === '#discord') return 'discord'
  return 'calendar'
}

// The public calendar lives in Calendar.jsx; #admin and #discord open the dashboards below.
function App() {
  const [view, setView] = useState(readView)

  useEffect(() => {
    const onHashChange = () => setView(readView())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  // A dashboard opens at its top, not at the calendar's scroll position.
  useEffect(() => {
    if (view !== 'calendar') window.scrollTo(0, 0)
  }, [view])

  if (view === 'admin') {
    return (
      <>
        <AdminDashboard onBack={() => { window.location.hash = '' }} />
        <footer className="footer"><BuildInfo /></footer>
      </>
    )
  }

  if (view === 'discord') {
    return (
      <>
        <DiscordDashboard onBack={() => { window.location.hash = '' }} />
        <footer className="footer"><BuildInfo /></footer>
      </>
    )
  }

  return <Calendar />
}

// Toast Component
function Toast({ message, type, onRemove }) {
  const [isHovered, setIsHovered] = useState(false)

  useEffect(() => {
    if (isHovered) return

    const timer = setTimeout(() => {
      onRemove()
    }, 5000)

    return () => clearTimeout(timer)
  }, [isHovered, onRemove])

  return (
    <div 
      className={`toast toast-${type}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="toast-content">
        <span className="toast-icon">
          {type === 'success' ? '✓' : '✕'}
        </span>
        <span className="toast-message">{message}</span>
      </div>
      <button className="toast-close" onClick={onRemove}>×</button>
    </div>
  )
}

export default App

function AdminDashboard({ onBack }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [customEvents, setCustomEvents] = useState([])
  const [form, setForm] = useState({
    name: '',
    location: '',
    date: '',
    end_date: '',
    type: 'custom',
    description: ''
  })
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })
  const [pastWeekendsInput, setPastWeekendsInput] = useState(String(DEFAULT_PAST_WEEKENDS_VISIBLE))

  useEffect(() => {
    checkAuth()
  }, [])

  useEffect(() => {
    if (isAuthenticated) {
      fetchCustomEvents()
      axios.get('/api/site-settings')
        .then(response => setPastWeekendsInput(String(response.data.pastWeekendsVisible)))
        .catch(() => setStatus('Failed to load site settings.'))
    }
  }, [isAuthenticated])

  const saveSiteSettings = async (e) => {
    e.preventDefault()
    setIsLoading(true)
    setStatus('')
    try {
      await axios.put('/api/admin/site-settings', { pastWeekendsVisible: Number(pastWeekendsInput) })
      setStatus('Site settings saved.')
    } catch (error) {
      setStatus('Failed to save site settings.')
    } finally {
      setIsLoading(false)
    }
  }

  const checkAuth = async () => {
    try {
      await axios.get('/api/admin/me')
      setIsAuthenticated(true)
    } catch {
      setIsAuthenticated(false)
    }
  }

  const login = async (e) => {
    e.preventDefault()
    setIsLoading(true)
    setStatus('')
    try {
      await axios.post('/api/admin/login', { username, password })
      setPassword('')
      setIsAuthenticated(true)
      setStatus('Login successful.')
    } catch (error) {
      setStatus('Login failed.')
    } finally {
      setIsLoading(false)
    }
  }

  const logout = async () => {
    setIsLoading(true)
    setStatus('')
    try {
      await axios.post('/api/admin/logout')
      setIsAuthenticated(false)
      setCustomEvents([])
      setStatus('Logged out.')
    } catch {
      setStatus('Logout failed.')
    } finally {
      setIsLoading(false)
    }
  }

  const fetchCustomEvents = async () => {
    try {
      const response = await axios.get('/api/admin/custom-events')
      setCustomEvents(response.data)
    } catch (error) {
      setStatus('Failed to load custom events.')
    }
  }

  const createCustomEvent = async (e) => {
    e.preventDefault()
    setIsLoading(true)
    setStatus('')
    try {
      const payload = {
        ...form,
        date: form.date ? new Date(form.date).toISOString() : '',
        end_date: form.end_date ? new Date(form.end_date).toISOString() : null
      }
      await axios.post('/api/admin/custom-events', payload)
      setForm({ name: '', location: '', date: '', end_date: '', type: 'custom', description: '' })
      setStatus('Custom event added.')
      await fetchCustomEvents()
    } catch (error) {
      setStatus('Failed to add custom event.')
    } finally {
      setIsLoading(false)
    }
  }

  const deleteCustomEvent = async (id) => {
    setIsLoading(true)
    setStatus('')
    try {
      await axios.delete(`/api/admin/custom-events/${id}`)
      setStatus('Custom event deleted.')
      await fetchCustomEvents()
    } catch (error) {
      setStatus('Failed to delete custom event.')
    } finally {
      setIsLoading(false)
    }
  }

  const triggerSync = async () => {
    setIsLoading(true)
    setStatus('')
    try {
      await axios.post('/api/admin/sync')
      setStatus('Calendar updated.')
    } catch (error) {
      setStatus('Failed to update calendar.')
    } finally {
      setIsLoading(false)
    }
  }

  const changePassword = async (e) => {
    e.preventDefault()
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setStatus('New passwords do not match.')
      return
    }
    setIsLoading(true)
    setStatus('')
    try {
      await axios.post('/api/admin/change-password', {
        username,
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword
      })
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
      setStatus('Password changed successfully.')
    } catch (error) {
      setStatus('Failed to change password.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="app admin-app">
      <div className="container">
        <header className="header">
          <div className="header-top">
            <h1>Admin Dashboard</h1>
            <button className="back-button" onClick={onBack}>Back to calendar</button>
          </div>
        </header>

        {!isAuthenticated ? (
          <form className="admin-card login-card" onSubmit={login}>
            <div className="login-hero">
              <span className="login-icon">🔒</span>
              <div>
                <h2>Sign in</h2>
                <p className="muted login-subtitle">Admin access for event management.</p>
              </div>
            </div>
            <div className="form-row">
              <label>Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
              />
            </div>
            <div className="form-row">
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <button className="primary-button" type="submit" disabled={isLoading}>Sign in</button>
            {status && <p className="status-text">{status}</p>}
          </form>
        ) : (
          <div className="admin-grid">
            <div className="admin-card">
              <div className="admin-card-header">
                <h2>Change password</h2>
              </div>
              <form onSubmit={changePassword}>
                <div className="form-row">
                  <label>Current password</label>
                  <input
                    type="password"
                    value={passwordForm.currentPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                    required
                  />
                </div>
                <div className="form-row">
                  <label>New password (min 10 characters)</label>
                  <input
                    type="password"
                    value={passwordForm.newPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                    required
                  />
                </div>
                <div className="form-row">
                  <label>Confirm new password</label>
                  <input
                    type="password"
                    value={passwordForm.confirmPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                    required
                  />
                </div>
                <button className="secondary-button" type="submit" disabled={isLoading}>Save password</button>
              </form>
            </div>

            <div className="admin-card">
              <div className="admin-card-header">
                <h2>Site settings</h2>
              </div>
              <form onSubmit={saveSiteSettings}>
                <div className="form-row">
                  <label htmlFor="past-weekends-visible">Finished weekends shown before the next one</label>
                  <input
                    id="past-weekends-visible"
                    type="number"
                    min="0"
                    max={MAX_PAST_WEEKENDS_VISIBLE}
                    step="1"
                    value={pastWeekendsInput}
                    onChange={(e) => setPastWeekendsInput(e.target.value)}
                    required
                  />
                </div>
                <button className="secondary-button" type="submit" disabled={isLoading}>Save settings</button>
              </form>
            </div>

            <div className="admin-card">
              <div className="admin-card-header">
                <h2>Admin actions</h2>
              </div>
              <button className="primary-button" onClick={triggerSync} disabled={isLoading}>Refresh calendar</button>
              <button className="secondary-button" onClick={logout} disabled={isLoading}>Sign out</button>
              {status && <p className="status-text">{status}</p>}
            </div>

            <div className="admin-card">
              <div className="admin-card-header">
                <h2>Create custom event</h2>
              </div>
              <form onSubmit={createCustomEvent}>
                <div className="form-row">
                  <label>Name</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Custom event name"
                    required
                  />
                </div>
                <div className="form-row">
                  <label>Location</label>
                  <input
                    type="text"
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    placeholder="Budapest"
                  />
                </div>
                <div className="form-row">
                  <label>Date and time</label>
                  <input
                    type="datetime-local"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    required
                  />
                </div>
                <div className="form-row">
                  <label>End date and time (optional)</label>
                  <input
                    type="datetime-local"
                    value={form.end_date}
                    onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                  />
                </div>
                <div className="form-row">
                  <label>Type</label>
                  <select
                    value="custom"
                    disabled
                  >
                    <option value="custom">Custom Event</option>
                  </select>
                  <input
                    type="hidden"
                    value="custom"
                  />
                </div>
                <div className="form-row">
                  <label>Description</label>
                  <textarea
                    rows="3"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Optional note"
                  />
                </div>
                <button className="primary-button" type="submit" disabled={isLoading}>Save</button>
              </form>
            </div>

            <div className="admin-card">
              <div className="admin-card-header">
                <h2>Custom events</h2>
                <button className="ghost-button" onClick={fetchCustomEvents} disabled={isLoading}>Refresh</button>
              </div>
              {customEvents.length === 0 ? (
                <p className="muted">No custom events.</p>
              ) : (
                <div className="custom-events-list">
                  {customEvents.map(event => (
                    <div key={event.id} className="custom-event-item">
                      <div className="custom-event-info">
                        <strong>{event.name}</strong>
                        <span>{new Date(event.date).toLocaleString('en-GB', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        {event.end_date && <span>Ends: {new Date(event.end_date).toLocaleString('en-GB', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>}
                        {event.location && <span>📍 {event.location}</span>}
                        {event.description && <span>{event.description}</span>}
                      </div>
                      <button
                        className="danger-button"
                        onClick={() => deleteCustomEvent(event.id)}
                        disabled={isLoading}
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  )
}

function DiscordDashboard({ onBack }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [user, setUser] = useState(null)
  const [adminGuilds, setAdminGuilds] = useState([])
  const [guildConfigs, setGuildConfigs] = useState({})
  const [status, setStatus] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isAuthLoading, setIsAuthLoading] = useState(true)
  const [isGuildsLoading, setIsGuildsLoading] = useState(false)
  const [selectedGuildId, setSelectedGuildId] = useState(null)
  const [channels, setChannels] = useState([])
  const [roles, setRoles] = useState([])
  const [notifications, setNotifications] = useState([])
  const [notificationEdits, setNotificationEdits] = useState({}) // Track edited event_types by notification id
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [newLeadMinutes, setNewLeadMinutes] = useState(60)
  const [selectedEventTypes, setSelectedEventTypes] = useState(['race', 'practice', 'qualifying', 'sprint', 'custom'])
  const [toasts, setToasts] = useState([])
  const [config, setConfig] = useState({ 
    channel_id: '', 
    lead_minutes: 60, 
    timezone: (() => {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone
      } catch {
        return 'UTC'
      }
    })(), 
    role_id: '',
    role_map: {}
  })
  const [weatherConfig, setWeatherConfig] = useState({
    channel_id: '',
    enabled: false,
    race_day_lead_minutes: '',
    role_id: ''
  })

  const showToast = (message, type = 'success') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    
    // Auto dismiss after 5 seconds
    setTimeout(() => {
      setToasts(prev => prev.filter(toast => toast.id !== id))
    }, 5000)
  }

  const removeToast = (id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }

  useEffect(() => {
    checkAuth()
  }, [])

  useEffect(() => {
    if (isAuthenticated) {
      fetchAdminGuilds()
    }
  }, [isAuthenticated])

  useEffect(() => {
    if (selectedGuildId) {
      fetchChannels(selectedGuildId)
      fetchRoles(selectedGuildId)
      fetchConfig(selectedGuildId)
      fetchWeatherConfig(selectedGuildId)
      fetchNotifications(selectedGuildId)
    }
  }, [selectedGuildId])

  useEffect(() => {
    if (config.channel_id && !weatherConfig.channel_id) {
      setWeatherConfig(prev => ({ ...prev, channel_id: config.channel_id }))
    }
  }, [config.channel_id, weatherConfig.channel_id])

  const checkAuth = async () => {
    setIsAuthLoading(true)
    try {
      const response = await axios.get('/api/discord/me')
      setUser(response.data)
      setIsAuthenticated(true)
    } catch {
      setIsAuthenticated(false)
    } finally {
      setIsAuthLoading(false)
    }
  }

  const fetchAdminGuilds = async () => {
    setIsGuildsLoading(true)
    try {
      const response = await axios.get('/api/discord/admin-guilds')
      setAdminGuilds(response.data)
    } catch {
      setStatus('Failed to load admin servers.')
    } finally {
      setIsGuildsLoading(false)
    }
  }

  const refreshAdminGuilds = async () => {
    setStatus('')
    await fetchAdminGuilds()
  }

  const fetchChannels = async (guildId) => {
    try {
      const response = await axios.get(`/api/discord/guilds/${guildId}/channels`)
      setChannels(response.data)
    } catch {
      setStatus('Failed to load channels.')
    }
  }

  const fetchRoles = async (guildId) => {
    try {
      const response = await axios.get(`/api/discord/guilds/${guildId}/roles`)
      setRoles(response.data)
    } catch {
      setStatus('Failed to load roles.')
    }
  }

  const fetchConfig = async (guildId) => {
    try {
      const response = await axios.get(`/api/discord/config/${guildId}`)
      if (response.data) {
        setConfig({
          channel_id: response.data.channel_id,
          lead_minutes: response.data.lead_minutes,
          timezone: response.data.timezone,
          role_id: response.data.role_id || '',
          role_map: response.data.role_map || {}
        })
        setGuildConfigs(prev => ({
          ...prev,
          [guildId]: response.data
        }))
      } else {
        setConfig({ 
          channel_id: '', 
          lead_minutes: 60, 
          timezone: (() => {
            try {
              return Intl.DateTimeFormat().resolvedOptions().timeZone
            } catch {
              return 'UTC'
            }
          })(), 
          role_id: '',
          role_map: {}
        })
        setGuildConfigs(prev => ({
          ...prev,
          [guildId]: null
        }))
      }
    } catch {
      setStatus('Failed to load settings.')
    }
  }

  const fetchWeatherConfig = async (guildId) => {
    try {
      const response = await axios.get(`/api/discord/weather-config/${guildId}`)
      if (response.data) {
        setWeatherConfig({
          channel_id: response.data.channel_id || config.channel_id || '',
          enabled: response.data.enabled ? true : false,
          race_day_lead_minutes: response.data.race_day_lead_minutes ?? '',
          role_id: response.data.role_id || ''
        })
      } else {
        setWeatherConfig({
          channel_id: config.channel_id || '',
          enabled: false,
          race_day_lead_minutes: '',
          role_id: ''
        })
      }
    } catch {
      setStatus('Failed to load weather notifications.')
    }
  }

  const fetchNotifications = async (guildId) => {
    try {
      const response = await axios.get(`/api/discord/notifications/${guildId}`)
      setNotifications(response.data)
      setNotificationEdits({}) // Clear edits when fetching
      setHasUnsavedChanges(false)
    } catch {
      setStatus('Failed to load notifications.')
    }
  }

  const addNotification = async () => {
    setIsLoading(true)
    try {
      await axios.post('/api/discord/notifications', {
        guild_id: selectedGuildId,
        lead_minutes: Number(newLeadMinutes),
        event_types: ['race', 'practice', 'qualifying', 'sprint', 'custom']
      })
      setNewLeadMinutes(60)
      await fetchNotifications(selectedGuildId)
      showToast('Notification added successfully!', 'success')
    } catch (error) {
      const errorMsg = error.response?.data?.error || 'Failed to add notification.'
      showToast(errorMsg, 'error')
    } finally {
      setIsLoading(false)
    }
  }

  const deleteNotification = async (id) => {
    setIsLoading(true)
    try {
      await axios.delete(`/api/discord/notifications/${id}`)
      await fetchNotifications(selectedGuildId)
      showToast('Notification deleted successfully!', 'success')
    } catch (error) {
      const errorMsg = error.response?.data?.error || 'Failed to delete notification.'
      showToast(errorMsg, 'error')
    } finally {
      setIsLoading(false)
    }
  }

  const handleNotificationEventTypeChange = (notificationId, eventType, isChecked) => {
    const currentEdits = notificationEdits[notificationId] || 
      (notifications.find(n => n.id === notificationId)?.event_types || [])
    
    let newEventTypes
    if (isChecked) {
      newEventTypes = [...currentEdits, eventType]
    } else {
      newEventTypes = currentEdits.filter(t => t !== eventType)
    }
    
    setNotificationEdits(prev => ({
      ...prev,
      [notificationId]: newEventTypes
    }))
    setHasUnsavedChanges(true)
  }

  const saveNotifications = async () => {
    setIsLoading(true)
    try {
      // Delete and recreate each modified notification
      for (const notificationId of Object.keys(notificationEdits)) {
        const notification = notifications.find(n => n.id === parseInt(notificationId))
        if (notification) {
          const newEventTypes = notificationEdits[notificationId]
          // Delete old
          await axios.delete(`/api/discord/notifications/${notificationId}`)
          // Recreate with new event_types
          await axios.post('/api/discord/notifications', {
            guild_id: selectedGuildId,
            lead_minutes: notification.lead_minutes,
            event_types: newEventTypes
          })
        }
      }
      await fetchNotifications(selectedGuildId)
      showToast('Notifications saved successfully!', 'success')
    } catch (error) {
      const errorMsg = error.response?.data?.error || 'Failed to save notifications.'
      showToast(errorMsg, 'error')
    } finally {
      setIsLoading(false)
    }
  }

  const saveConfig = async (e) => {
    e.preventDefault()
    setIsLoading(true)
    try {
      await axios.post('/api/discord/config', {
        guild_id: selectedGuildId,
        channel_id: config.channel_id,
        lead_minutes: 60,
        timezone: config.timezone,
        role_id: config.role_id || null,
        role_map: config.role_map || {}
      })
      showToast('Settings saved successfully!', 'success')
      await fetchAdminGuilds()
    } catch (error) {
      const errorMsg = error.response?.data?.error || 'Failed to save settings.'
      showToast(errorMsg, 'error')
    } finally {
      setIsLoading(false)
    }
  }

  const saveWeatherConfig = async (e) => {
    e.preventDefault()
    setIsLoading(true)
    try {
      await axios.post('/api/discord/weather-config', {
        guild_id: selectedGuildId,
        channel_id: weatherConfig.channel_id || config.channel_id,
        enabled: Boolean(weatherConfig.enabled),
        race_day_lead_minutes: weatherConfig.race_day_lead_minutes ? Number(weatherConfig.race_day_lead_minutes) : null,
        role_id: weatherConfig.role_id || null
      })
      showToast('Weather notification configured!', 'success')
      await fetchWeatherConfig(selectedGuildId)
    } catch (error) {
      const errorMsg = error.response?.data?.error || 'Failed to save weather notification.'
      showToast(errorMsg, 'error')
    } finally {
      setIsLoading(false)
    }
  }

  const sendWeatherTest = async () => {
    setIsLoading(true)
    try {
      await axios.post('/api/discord/weather-test', {
        guild_id: selectedGuildId
      })
      showToast('Weather test sent!', 'success')
    } catch (error) {
      const errorMsg = error.response?.data?.error || 'Failed to send weather test.'
      showToast(errorMsg, 'error')
    } finally {
      setIsLoading(false)
    }
  }

  const logout = async () => {
    setIsLoading(true)
    setStatus('')
    try {
      await axios.post('/api/discord/logout')
      setIsAuthenticated(false)
      setUser(null)
      setAdminGuilds([])
      setGuildConfigs({})
      setSelectedGuildId(null)
      setStatus('Logged out.')
      showToast('Signed out successfully!', 'success')
    } catch (error) {
      const errorMsg = error.response?.data?.error || 'Failed to sign out.'
      setStatus(errorMsg)
      showToast(errorMsg, 'error')
    } finally {
      setIsLoading(false)
    }
  }

  const handleInviteBot = async () => {
    try {
      const response = await axios.get('/api/discord/invite-url')
      window.open(response.data.url, '_blank')
    } catch {
      setStatus('Failed to invite the bot.')
    }
  }

  const handleTestNotification = async () => {
    setIsLoading(true)
    setStatus('')
    try {
      await axios.post('/api/discord/test-notification', {
        guild_id: selectedGuildId
      })
      setStatus('Test notification sent!')
      showToast('Test notification sent successfully!', 'success')
    } catch (error) {
      const errorMsg = error.response?.data?.error || 'Failed to send test notification.'
      setStatus(errorMsg)
      showToast(errorMsg, 'error')
    } finally {
      setIsLoading(false)
    }
  }

  if (selectedGuildId) {
    const guild = adminGuilds.find(g => g.id === selectedGuildId)
    return (
      <div className="app admin-app">
        <div className="container">
          <header className="header">
            <div className="header-top">
                <h1>{guild?.name} - Settings</h1>
                <button className="back-button" onClick={() => setSelectedGuildId(null)}>Back to admin servers</button>
            </div>
          </header>

          <div className="admin-grid">
            <div className="admin-card">
              <div className="admin-card-header">
                <h2>Notification settings</h2>
              </div>
              <form onSubmit={saveConfig}>
                <div className="form-row">
                  <label>Channel</label>
                  <select
                    value={config.channel_id}
                    onChange={(e) => setConfig({ ...config, channel_id: e.target.value })}
                    required
                  >
                    <option value="">Select a channel</option>
                    {channels.map((c) => (
                      <option key={c.id} value={c.id}>#{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-row">
                  <label>Timezone</label>
                  <select
                    value={config.timezone}
                    onChange={(e) => setConfig({ ...config, timezone: e.target.value })}
                    required
                  >
                    {TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>{tz}</option>
                    ))}
                  </select>
                </div>
                <div className="form-row">
                  <label>Roles by event type (optional)</label>
                  <div className="role-mapping-grid">
                    {['race', 'qualifying', 'practice', 'sprint', 'custom'].map((type) => (
                      <div key={type} className="role-mapping-item">
                        <span className="role-mapping-label">
                          {type === 'race' ? 'Race' : type === 'qualifying' ? 'Qualifying' : type === 'practice' ? 'Practice' : type === 'sprint' ? 'Sprint' : 'Custom'}
                        </span>
                        <select
                          value={config.role_map?.[type] || ''}
                          onChange={(e) => setConfig({
                            ...config,
                            role_map: {
                              ...(config.role_map || {}),
                              [type]: e.target.value
                            }
                          })}
                        >
                          <option value="">No role</option>
                          {roles
                            .filter(r => r.name !== '@everyone')
                            .sort((a, b) => b.position - a.position)
                            .map((r) => (
                              <option key={r.id} value={r.id}>{r.name}</option>
                            ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
                <button className="primary-button" type="submit" disabled={isLoading}>Save base settings</button>
              </form>
            </div>

            <div className="admin-card">
              <div className="admin-card-header">
                <h2>🌦️ Weather notifications</h2>
              </div>
              <p className="muted">Sends a 3-day forecast for the full race weekend after midnight on the first race day.</p>
              <form onSubmit={saveWeatherConfig}>
                <div className="form-row">
                  <label>Weather channel</label>
                  <select
                    value={weatherConfig.channel_id}
                    onChange={(e) => setWeatherConfig({ ...weatherConfig, channel_id: e.target.value })}
                    required
                    disabled={isLoading}
                  >
                    <option value="">Select a channel</option>
                    {channels.map((c) => (
                      <option key={c.id} value={c.id}>#{c.name}</option>
                    ))}
                  </select>
                  <small className="muted" style={{ marginTop: '0.5rem', display: 'block' }}>
                    This should be a separate channel from race notifications.
                  </small>
                </div>
                <div className="form-row">
                  <label>Enabled</label>
                  <label className="checkbox-label" style={{ marginTop: '0.35rem' }}>
                    <input
                      type="checkbox"
                      checked={weatherConfig.enabled}
                      onChange={(e) => setWeatherConfig({ ...weatherConfig, enabled: e.target.checked })}
                      disabled={isLoading}
                    />
                    <span className="checkbox-text">Enable weekend weather notifications</span>
                  </label>
                </div>
                <div className="form-row">
                  <label>Role mention (optional)</label>
                  <select
                    value={weatherConfig.role_id}
                    onChange={(e) => setWeatherConfig({ ...weatherConfig, role_id: e.target.value })}
                    disabled={isLoading}
                  >
                    <option value="">No role</option>
                    {roles
                      .filter(r => r.name !== '@everyone')
                      .sort((a, b) => b.position - a.position)
                      .map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                  </select>
                  <small className="muted" style={{ marginTop: '0.5rem', display: 'block' }}>
                    Selected role is mentioned in weather notifications.
                  </small>
                </div>
                <div className="form-row">
                  <label>Race-day notification (minutes)</label>
                  <input
                    type="number"
                    min="5"
                    max="1440"
                    placeholder="Optional"
                    value={weatherConfig.race_day_lead_minutes}
                    onChange={(e) => setWeatherConfig({ ...weatherConfig, race_day_lead_minutes: e.target.value })}
                    disabled={isLoading}
                  />
                  <small className="muted" style={{ marginTop: '0.5rem', display: 'block' }}>
                    Minutes before the first race on event day to send a weather alert (5-1440). Leave empty to disable.
                  </small>
                </div>
                <button className="primary-button" type="submit" disabled={isLoading}>
                  Save weather notification
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={sendWeatherTest}
                  disabled={isLoading}
                >
                  Send weather test now
                </button>
              </form>
            </div>

            <div className="admin-card">
              <div className="admin-card-header">
                <h2>⏰ Notification timing</h2>
              </div>
              {notifications.length === 0 && (
                <p className="muted">Add multiple notifications for different times (for example 5, 10, 30 minutes before an event).</p>
              )}
              
              <div className="notifications-list">
                {notifications.length === 0 ? (
                  <p className="muted">No notifications configured yet.</p>
                ) : (
                  notifications.map((notif) => (
                    <div key={notif.id} className="notification-item-expanded">
                      <div className="notification-header">
                        <div className="notification-info">
                          <span className="notification-time">
                            {notif.lead_minutes === 0 ? 'At event start' : `${notif.lead_minutes} minutes before`}
                          </span>
                        </div>
                        <button
                          className="danger-button"
                          onClick={() => deleteNotification(notif.id)}
                          disabled={isLoading}
                        >
                          Delete
                        </button>
                      </div>
                      <div className="notification-types">
                        <span className="notification-types-label">Types:</span>
                        <div className="event-type-checkboxes">
                          {['race', 'practice', 'qualifying', 'sprint', 'custom'].map(type => {
                            const eventTypes = notificationEdits[notif.id] || notif.event_types || []
                            return (
                              <label key={type} className="checkbox-label">
                                <input
                                  type="checkbox"
                                  checked={eventTypes.includes(type)}
                                  onChange={(e) => handleNotificationEventTypeChange(notif.id, type, e.target.checked)}
                                />
                                <span className="checkbox-text">{type === 'practice' ? 'Practice' : type === 'qualifying' ? 'Qualifying' : type === 'sprint' ? 'Sprint' : type === 'race' ? 'Race' : 'Custom'}</span>
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {hasUnsavedChanges && (
                <div className="unsaved-changes-section">
                  <div className="unsaved-changes-message">
                    <span className="unsaved-changes-icon">⚠️</span>
                    <span className="unsaved-changes-text">Changes are not saved</span>
                  </div>
                  <button
                    className="unsaved-changes-button"
                    onClick={saveNotifications}
                    disabled={isLoading}
                  >
                    {isLoading ? 'Saving...' : 'Save changes'}
                  </button>
                </div>
              )}

              <div className="add-notification">
                <div className="form-row">
                  <label>Notification timing (minutes)</label>
                  <input
                    type="number"
                    min="0"
                    max="1440"
                    value={newLeadMinutes}
                    onChange={(e) => setNewLeadMinutes(e.target.value)}
                    placeholder="e.g. 5"
                  />
                  <small className="muted" style={{ marginTop: '0.5rem', display: 'block' }}>
                    Example: <strong>5 minutes</strong> → alert 5 minutes before the event, <strong>0 minutes</strong> → alert at start time
                  </small>
                </div>
                <button 
                  className="secondary-button" 
                  onClick={addNotification}
                  disabled={isLoading}
                >
                  Add notification
                </button>
              </div>
              
              <button 
                className="primary-button" 
                onClick={handleTestNotification}
                disabled={isLoading}
                style={{ marginTop: '1rem' }}
              >
                Send test notification
              </button>
            </div>
          </div>
        </div>

        {/* Toast Notifications */}
        <div className="toast-container">
          {toasts.map(toast => (
            <Toast 
              key={toast.id} 
              message={toast.message} 
              type={toast.type} 
              onRemove={() => removeToast(toast.id)}
            />
          ))}
        </div>
      </div>
    )
  }

  if (isAuthLoading) {
    return (
      <div className="app admin-app">
        <div className="container">
          <header className="header">
            <div className="header-top">
              <h1>Discord Dashboard</h1>
              <button className="back-button" onClick={onBack}>Back to calendar</button>
            </div>
          </header>
          <div className="admin-card" style={{ textAlign: 'center', padding: '3rem' }}>
            <p className="muted">Loading...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app admin-app">
      <div className="container">
        <header className="header">
          <div className="header-top">
            <h1>Discord Dashboard</h1>
            <button className="back-button" onClick={onBack}>Back to calendar</button>
          </div>
        </header>

        {!isAuthenticated ? (
          <div className="admin-card login-card discord-login-card">
            <div className="login-hero">
              <span className="login-icon">💬</span>
              <div>
                <h2>Discord sign in</h2>
                <p className="muted login-subtitle">Sign in with Discord to configure bot notifications.</p>
              </div>
            </div>
            <a className="primary-button" href="/api/discord/login">Sign in with Discord</a>
          </div>
        ) : (
          <div className="admin-grid">
            <div className="admin-card">
              <div className="admin-card-header">
                <h2>Account</h2>
              </div>
              <div className="discord-user-profile">
                {user?.avatarUrl && (
                  <img src={user.avatarUrl} alt={user.username} className="discord-user-avatar" />
                )}
                <p><strong>{user?.username}</strong></p>
              </div>
              <button className="secondary-button" onClick={logout} disabled={isLoading}>Sign out</button>
            </div>

            <div className="admin-card">
              <div className="admin-card-header">
                <h2>🤖 Invite bot</h2>
              </div>
              <p className="muted">Click the button below to invite the bot to your servers.</p>
              <button 
                className="primary-button" 
                onClick={handleInviteBot}
                disabled={isLoading}
              >
                Add bot to Discord server
              </button>
              {status && <p className="status-text">{status}</p>}
            </div>

            <div className="admin-card admin-card-full-width">
              <div className="admin-card-header">
                <h2>📋 Server management</h2>
                <button
                  className="secondary-button"
                  onClick={refreshAdminGuilds}
                  disabled={isGuildsLoading || isLoading}
                >
                  Refresh
                </button>
              </div>
              {isGuildsLoading ? (
                <div className="loading-container">
                  <div className="spinner"></div>
                  <p className="muted">Loading servers...</p>
                </div>
              ) : adminGuilds.length === 0 ? (
                <p className="muted">No servers found where you have admin rights and the bot is present.</p>
              ) : (
                <div className="guilds-grid">
                  {adminGuilds.map((guild) => (
                    <div key={guild.id} className="guild-card">
                      <div className="guild-banner">
                        {guild.icon ? (
                          <img 
                            src={`https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128`} 
                            alt={guild.name} 
                            className="guild-avatar" 
                          />
                        ) : (
                          <div className="guild-avatar-placeholder">
                            {guild.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="guild-card-content">
                        <h3 className="guild-card-name">{guild.name}</h3>
                        <button
                          className="guild-dashboard-button"
                          onClick={() => setSelectedGuildId(guild.id)}
                          disabled={isLoading}
                        >
                          Open dashboard
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Toast Notifications */}
      <div className="toast-container">
        {toasts.map(toast => (
          <Toast 
            key={toast.id} 
            message={toast.message} 
            type={toast.type} 
            onRemove={() => removeToast(toast.id)}
          />
        ))}
      </div>
    </div>
  )
}
