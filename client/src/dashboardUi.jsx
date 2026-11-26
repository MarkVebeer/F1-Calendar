import { useEffect, useId, useMemo, useState } from 'react'
import './calendar.css'
import './dashboard.css'
import BuildInfo from './BuildInfo'
import Sheet from './Sheet'
import { useTheme } from './theme'
import { AlertIcon, CheckIcon, MoonIcon, SearchIcon, SunIcon } from './icons'

// The calendar's header and theme, around a dashboard page. The wordmark always leads back to the calendar.
export function DashShell({ title, account, children }) {
  const { resolved, setPreference } = useTheme()

  useEffect(() => {
    document.body.classList.add('cal-body')
    window.scrollTo(0, 0)
    return () => document.body.classList.remove('cal-body')
  }, [])

  return (
    <div className="cal dash">
      <a className="skip-link" href="#dash-main">Skip to content</a>
      <header className="cal-header dash-header">
        <a className="wordmark-link" href="#" aria-label="F1 Calendar, back to the calendar">
          <span className="wordmark">F1 <span>Calendar</span></span>
        </a>
        <div className="header-actions">
          {account}
          <button
            type="button"
            className="icon-button"
            onClick={() => setPreference(resolved === 'dark' ? 'light' : 'dark')}
            aria-label={resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {resolved === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </header>
      <main id="dash-main" className="dash-main">
        {title && <h1 className="dash-title">{title}</h1>}
        {children}
      </main>
      <footer className="cal-footer">
        <p><a href="#">Back to the calendar</a></p>
        <BuildInfo />
      </footer>
    </div>
  )
}

// One line of feedback next to the action that caused it. Errors say what failed and what to do.
export function StatusLine({ status }) {
  if (!status) return <p className="status-line-slot" role="status" aria-live="polite" />
  const Icon = status.type === 'error' ? AlertIcon : status.type === 'ok' ? CheckIcon : null
  return (
    <p className={`status-message status-message--${status.type}`} role={status.type === 'error' ? 'alert' : 'status'} aria-live="polite">
      {Icon && <Icon size={16} />}
      <span>{status.text}</span>
    </p>
  )
}

export function Field({ label, hint, children, htmlFor }) {
  const hintId = hint ? `${htmlFor}-hint` : undefined
  return (
    <div className="form-field">
      <label className="form-label" htmlFor={htmlFor}>{label}</label>
      {typeof children === 'function' ? children(hintId) : children}
      {hint && <p className="form-hint" id={hintId}>{hint}</p>}
    </div>
  )
}

// A native select; with many options a filter box above it narrows the list (servers can have 100+ channels).
export function SearchableSelect({ id, value, onChange, options, placeholder, describedBy, required, disabled }) {
  const [filter, setFilter] = useState('')
  const filterId = useId()
  const many = options.length > 20
  const shown = useMemo(() => {
    const query = filter.trim().toLowerCase()
    if (!query) return options
    return options.filter((option) => option.value === value || option.label.toLowerCase().includes(query))
  }, [options, filter, value])

  return (
    <div className="search-select">
      {many && (
        <div className="field field--compact">
          <SearchIcon size={16} />
          <label className="sr-only" htmlFor={filterId}>Filter the list</label>
          <input id={filterId} type="search" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder={`Filter ${options.length} options`} autoComplete="off" disabled={disabled} />
        </div>
      )}
      <select id={id} className="select" value={value} onChange={(event) => onChange(event.target.value)} aria-describedby={describedBy} required={required} disabled={disabled}>
        <option value="">{placeholder}</option>
        {shown.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </div>
  )
}

// Asks before something that cannot be undone, in the same native dialog the calendar uses.
export function ConfirmSheet({ open, title, body, confirmLabel, onConfirm, onCancel }) {
  return (
    <Sheet open={open} onClose={onCancel} labelledBy="confirm-title" className="sheet--confirm">
      {open && (
        <div className="sheet-inner">
          <div className="sheet-body confirm-body">
            <h2 id="confirm-title" className="sheet-title" tabIndex={-1} data-autofocus>{title}</h2>
            <p className="setting-hint">{body}</p>
            <div className="button-row">
              <button type="button" className="button button--danger" onClick={onConfirm}>{confirmLabel}</button>
              <button type="button" className="button button--secondary" onClick={onCancel}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </Sheet>
  )
}

// "3 hours before", "10 minutes before", "At the start".
export function describeLead(minutes) {
  const value = Number(minutes)
  if (!value) return 'At the start'
  if (value % 1440 === 0) return `${value / 1440} day${value === 1440 ? '' : 's'} before`
  if (value % 60 === 0) return `${value / 60} hour${value === 60 ? '' : 's'} before`
  if (value > 60) return `${Math.floor(value / 60)} h ${value % 60} min before`
  return `${value} minute${value === 1 ? '' : 's'} before`
}

// Turns an axios error into a sentence for the person: the server's message when it gave one.
export function errorText(error, fallback) {
  const message = error?.response?.data?.error
  if (error?.response?.status === 401) return 'Your session has ended. Sign in again.'
  if (!error?.response) return `${fallback} The server did not answer; check your connection and try again.`
  // A generic "Failed to …" from the server only repeats the fallback; a specific reason is worth adding.
  return message && !/^failed to /i.test(message) ? `${fallback} ${message}.` : fallback
}
