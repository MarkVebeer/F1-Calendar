import { useCallback, useEffect, useState } from 'react'
import axios from 'axios'
import { ConfirmSheet, DashShell, Field, StatusLine, errorText } from './dashboardUi'
import { RefreshIcon, TrashIcon } from './icons'
import { formatDay, formatTime, timeZoneLabel, zonedTimeToDate } from './format'

axios.defaults.withCredentials = true

// The server enforces the same range for the "finished weekends shown" setting.
const MAX_PAST_WEEKENDS_VISIBLE = 24
const EMPTY_EVENT = { name: '', location: '', date: '', end_date: '', description: '' }

// The timezone picked on the calendar (stored under the same key there), else this device's.
function deviceZone() {
  try {
    const chosen = localStorage.getItem('f1-timezone')
    if (chosen) return chosen
  } catch {
    // storage blocked: fall back to the device
  }
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

function when(iso, zone) {
  return `${formatDay(iso, zone)} ${formatTime(iso, zone)} ${timeZoneLabel(zone, iso)}`
}

function SignIn({ onSignedIn }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setStatus(null)
    try {
      await axios.post('/api/admin/login', { username, password })
      setPassword('')
      onSignedIn(username)
    } catch (error) {
      const status = error?.response?.status
      setStatus({
        type: 'error',
        text: status === 401 ? 'Wrong username or password. Use the admin login from the server settings.'
          : status === 429 ? 'Too many attempts. Wait a few minutes and try again.'
            : errorText(error, 'Signing in failed.')
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel signin" aria-labelledby="signin-title">
      <div>
        <h2 id="signin-title" className="panel-title">Sign in</h2>
        <p className="panel-hint">For the site owner: manage custom events, the calendar sync and site settings.</p>
      </div>
      <form className="form-grid" onSubmit={submit}>
        <Field label="Username" htmlFor="admin-username">
          <input id="admin-username" className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
        </Field>
        <Field label="Password" htmlFor="admin-password">
          <input id="admin-password" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </Field>
        <div className="button-row">
          <button className="button" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </div>
        <StatusLine status={status} />
      </form>
    </section>
  )
}

function SyncBar() {
  const [state, setState] = useState(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(null)
  const zone = deviceZone()

  useEffect(() => {
    axios.get('/api/admin/sync-status').then((r) => setState(r.data.status)).catch(() => setState(null))
  }, [])

  const syncNow = async () => {
    setBusy(true)
    setStatus(null)
    try {
      const response = await axios.post('/api/admin/sync')
      setState(response.data.status)
      setStatus({ type: 'ok', text: 'The calendar is up to date.' })
    } catch (error) {
      if (error?.response?.data?.status) setState(error.response.data.status)
      setStatus({ type: 'error', text: errorText(error, 'The calendar could not be refreshed.') })
    } finally {
      setBusy(false)
    }
  }

  const failed = state && !state.ok
  let chip = ['chip--tbc', 'Not synced yet']
  let headline = 'No sync recorded yet'
  let detail = 'The calendar syncs on start and every hour.'
  if (state?.ok) {
    chip = ['chip--live', 'Up to date']
    headline = `Synced ${when(state.at, zone)}`
    detail = `${state.sessions} sessions from the F1 calendar feed. Next automatic sync on the hour.`
  } else if (failed) {
    chip = ['chip--soon', 'Sync failed']
    headline = 'The last sync failed'
    detail = `${when(state.at, zone)}: ${state.error}. ${state.lastSuccessAt ? `Last good sync ${when(state.lastSuccessAt, zone)}; the site keeps showing that data.` : 'The site keeps the races it already has.'}`
  }

  return (
    <section className="sync-bar" aria-labelledby="sync-title">
      <span className={`chip ${chip[0]}`}>{chip[1]}</span>
      <div className="sync-text">
        <strong id="sync-title">{headline}</strong>
        <span>{detail}</span>
      </div>
      <button type="button" className="button button--secondary" onClick={syncNow} disabled={busy}>
        <RefreshIcon size={18} />
        {busy ? 'Syncing…' : 'Refresh now'}
      </button>
      {status && <div style={{ gridColumn: '1 / -1' }}><StatusLine status={status} /></div>}
    </section>
  )
}

function CustomEvents() {
  const [events, setEvents] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [form, setForm] = useState(EMPTY_EVENT)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
  const zone = deviceZone()

  const load = useCallback(() => {
    axios.get('/api/admin/custom-events')
      .then((r) => setEvents(r.data))
      .catch((error) => setStatus({ type: 'error', text: errorText(error, 'Custom events could not be loaded.') }))
      .finally(() => setLoaded(true))
  }, [])

  useEffect(load, [load])

  const create = async (event) => {
    event.preventDefault()
    // The inputs are read in the zone the hint names, not in the browser's own.
    const start = zonedTimeToDate(form.date, zone)
    const end = form.end_date ? zonedTimeToDate(form.end_date, zone) : null
    if (end && end < start) {
      setStatus({ type: 'error', text: 'The end is before the start. Pick an end time after the start, or leave it empty.' })
      return
    }
    setBusy(true)
    setStatus(null)
    try {
      await axios.post('/api/admin/custom-events', {
        ...form,
        type: 'custom',
        date: start.toISOString(),
        end_date: end ? end.toISOString() : null
      })
      setForm(EMPTY_EVENT)
      setStatus({ type: 'ok', text: `“${form.name}” is on the calendar.` })
      load()
    } catch (error) {
      setStatus({ type: 'error', text: errorText(error, 'The event could not be added.') })
    } finally {
      setBusy(false)
    }
  }

  const confirmDelete = async () => {
    const target = pendingDelete
    setPendingDelete(null)
    setBusy(true)
    try {
      await axios.delete(`/api/admin/custom-events/${target.id}`)
      setStatus({ type: 'ok', text: `“${target.name}” was removed.` })
      load()
    } catch (error) {
      setStatus({ type: 'error', text: errorText(error, 'The event could not be removed.') })
    } finally {
      setBusy(false)
    }
  }

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  return (
    <section className="panel" aria-labelledby="events-title">
      <div>
        <h2 id="events-title" className="panel-title">Custom events</h2>
        <p className="panel-hint">Watch parties and other events of your own appear in the calendar next to the F1 sessions. Times are in {zone.replace(/_/g, ' ')} time.</p>
      </div>

      {loaded && events.length === 0 && <p className="empty-note">No custom events yet. Add one below.</p>}
      {events.length > 0 && (
        <ul className="list">
          {events.map((item) => (
            <li key={item.id} className="list-row" style={{ gridTemplateColumns: '1fr auto' }}>
              <div className="list-row-main">
                <span className="list-row-title">{item.name}</span>
                <span className="list-row-meta">{[when(item.date, zone), item.location].filter(Boolean).join(' · ')}</span>
              </div>
              <button type="button" className="icon-button" onClick={() => setPendingDelete(item)} aria-label={`Remove ${item.name}`} disabled={busy}>
                <TrashIcon />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form className="form-grid form-grid--two" onSubmit={create}>
        <Field label="Name" htmlFor="event-name">
          <input id="event-name" className="input" value={form.name} onChange={set('name')} placeholder="Watch party" required />
        </Field>
        <Field label="Location" htmlFor="event-location">
          <input id="event-location" className="input" value={form.location} onChange={set('location')} placeholder="Budapest" />
        </Field>
        <Field label="Starts" htmlFor="event-start">
          <input id="event-start" className="input" type="datetime-local" value={form.date} onChange={set('date')} required />
        </Field>
        <Field label="Ends (optional)" htmlFor="event-end">
          <input id="event-end" className="input" type="datetime-local" value={form.end_date} onChange={set('end_date')} />
        </Field>
        <div className="form-field form-field--wide">
          <label className="form-label" htmlFor="event-description">Note (optional)</label>
          <textarea id="event-description" className="input" value={form.description} onChange={set('description')} />
        </div>
        <div className="button-row form-field--wide">
          <button className="button" type="submit" disabled={busy}>Add event</button>
        </div>
      </form>
      <StatusLine status={status} />

      <ConfirmSheet
        open={Boolean(pendingDelete)}
        title={`Remove “${pendingDelete?.name || ''}”?`}
        body="It disappears from the calendar for everyone, and reminders for it stop. This cannot be undone."
        confirmLabel="Remove event"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </section>
  )
}

function SiteSettings() {
  const [value, setValue] = useState('')
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    axios.get('/api/site-settings')
      .then((r) => setValue(String(r.data.pastWeekendsVisible)))
      .catch((error) => setStatus({ type: 'error', text: errorText(error, 'Site settings could not be loaded.') }))
  }, [])

  const save = async (event) => {
    event.preventDefault()
    setBusy(true)
    setStatus(null)
    try {
      await axios.put('/api/admin/site-settings', { pastWeekendsVisible: Number(value) })
      setStatus({ type: 'ok', text: 'Saved. The calendar now shows this many finished weekends.' })
    } catch (error) {
      setStatus({ type: 'error', text: errorText(error, 'The setting could not be saved.') })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel" aria-labelledby="site-title">
      <h2 id="site-title" className="panel-title">Site settings</h2>
      <form className="form-grid" onSubmit={save}>
        <Field label="Finished weekends shown before the next one" htmlFor="past-weekends" hint={`0 hides them all; up to ${MAX_PAST_WEEKENDS_VISIBLE}. Search still finds every weekend.`}>
          <input id="past-weekends" className="input" style={{ maxWidth: 120 }} type="number" min="0" max={MAX_PAST_WEEKENDS_VISIBLE} step="1" value={value} onChange={(e) => setValue(e.target.value)} aria-describedby="past-weekends-hint" required />
        </Field>
        <div className="button-row">
          <button className="button" type="submit" disabled={busy}>Save</button>
        </div>
        <StatusLine status={status} />
      </form>
    </section>
  )
}

function PasswordChange({ username }) {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)

  const save = async (event) => {
    event.preventDefault()
    if (form.newPassword.length < 10) {
      setStatus({ type: 'error', text: 'The new password needs at least 10 characters.' })
      return
    }
    if (form.newPassword !== form.confirmPassword) {
      setStatus({ type: 'error', text: 'The two new passwords do not match.' })
      return
    }
    setBusy(true)
    setStatus(null)
    try {
      await axios.post('/api/admin/change-password', { username, currentPassword: form.currentPassword, newPassword: form.newPassword })
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
      setStatus({ type: 'ok', text: 'Password changed. Other browsers were signed out. Note: the password from the server settings is applied again on the next restart.' })
    } catch (error) {
      setStatus({ type: 'error', text: error?.response?.status === 401 ? 'The current password is wrong.' : errorText(error, 'The password could not be changed.') })
    } finally {
      setBusy(false)
    }
  }

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  return (
    <section className="panel" aria-labelledby="password-title">
      <h2 id="password-title" className="panel-title">Password</h2>
      <form className="form-grid form-grid--two" onSubmit={save}>
        <div className="form-field--alone">
          <Field label="Current password" htmlFor="pw-current">
            <input id="pw-current" className="input" type="password" value={form.currentPassword} onChange={set('currentPassword')} autoComplete="current-password" required />
          </Field>
        </div>
        <Field label="New password" htmlFor="pw-new" hint="At least 10 characters.">
          <input id="pw-new" className="input" type="password" value={form.newPassword} onChange={set('newPassword')} autoComplete="new-password" aria-describedby="pw-new-hint" required />
        </Field>
        <Field label="Repeat new password" htmlFor="pw-confirm">
          <input id="pw-confirm" className="input" type="password" value={form.confirmPassword} onChange={set('confirmPassword')} autoComplete="new-password" required />
        </Field>
        <div className="button-row form-field--wide">
          <button className="button" type="submit" disabled={busy}>Change password</button>
        </div>
      </form>
      <StatusLine status={status} />
    </section>
  )
}

export default function AdminPanel() {
  const [auth, setAuth] = useState({ checked: false, signedIn: false, username: '' })
  const [signOutStatus, setSignOutStatus] = useState(null)

  useEffect(() => {
    axios.get('/api/admin/me')
      .then((r) => setAuth({ checked: true, signedIn: true, username: r.data.username || '' }))
      .catch(() => setAuth({ checked: true, signedIn: false, username: '' }))
  }, [])

  const signOut = async () => {
    try {
      await axios.post('/api/admin/logout')
      setAuth({ checked: true, signedIn: false, username: '' })
    } catch (error) {
      setSignOutStatus({ type: 'error', text: errorText(error, 'Signing out failed.') })
    }
  }

  const account = auth.signedIn ? (
    <span className="account">
      {auth.username && <span className="account-name">{auth.username}</span>}
      <button type="button" className="text-button" onClick={signOut}>Sign out</button>
    </span>
  ) : null

  return (
    <DashShell title="Admin" account={account}>
      {!auth.checked && <p className="empty-note" role="status">Checking your session…</p>}
      {auth.checked && !auth.signedIn && <SignIn onSignedIn={(username) => setAuth({ checked: true, signedIn: true, username })} />}
      {auth.signedIn && (
        <>
          <StatusLine status={signOutStatus} />
          <SyncBar />
          <CustomEvents />
          <SiteSettings />
          <PasswordChange username={auth.username} />
        </>
      )}
    </DashShell>
  )
}
