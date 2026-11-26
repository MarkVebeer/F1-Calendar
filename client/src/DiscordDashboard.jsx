import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { ConfirmSheet, DashShell, Field, SearchableSelect, StatusLine, describeLead, errorText } from './dashboardUi'
import { BackIcon, CheckIcon, PlusIcon, RefreshIcon, SearchIcon, SendIcon, TrashIcon } from './icons'
import { formatTime } from './format'

axios.defaults.withCredentials = true

const EVENT_TYPES = [
  ['practice', 'Practice'],
  ['qualifying', 'Qualifying'],
  ['sprint', 'Sprint'],
  ['race', 'Race'],
  ['custom', 'Custom events']
]
const ALL_TYPES = EVENT_TYPES.map(([type]) => type)
const LEAD_PRESETS = [1440, 60, 15, 0]

const TIMEZONES = (() => {
  try {
    return Intl.supportedValuesOf('timeZone')
  } catch {
    return ['UTC']
  }
})()

function deviceZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

const channelOptions = (channels) => channels.map((c) => ({ value: c.id, label: `#${c.name}` }))
const roleOptions = (roles) => roles
  .filter((r) => r.name !== '@everyone')
  .sort((a, b) => b.position - a.position)
  .map((r) => ({ value: r.id, label: `@${r.name}` }))

function guildIconUrl(guild) {
  return guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=96` : null
}

function ServerIcon({ guild }) {
  const url = guildIconUrl(guild)
  return (
    <span className="server-icon" aria-hidden="true">
      {url ? <img src={url} alt="" /> : guild.name.charAt(0).toUpperCase()}
    </span>
  )
}

async function openBotInvite(guildId) {
  const { data } = await axios.get('/api/discord/invite-url', { params: { guild_id: guildId } })
  window.open(data.url, '_blank', 'noopener')
}

// ---------- message preview ----------

const hex = (value) => `#${Number(value || 0).toString(16).padStart(6, '0')}`

// What the bot will post, rendered the way Discord shows it, from the bot's own message builder.
function MessagePreview({ leadMinutes, eventTypes, timezone, roleMap, roleId, roles, label = 'Preview of the next reminder' }) {
  const [state, setState] = useState({ loading: true })
  const request = JSON.stringify({ lead_minutes: leadMinutes, event_types: eventTypes, timezone, role_map: roleMap, role_id: roleId })

  useEffect(() => {
    let active = true
    setState((s) => ({ ...s, loading: true }))
    const timer = setTimeout(() => {
      axios.post('/api/discord/preview', JSON.parse(request))
        .then((r) => active && setState({ loading: false, data: r.data }))
        .catch((error) => active && setState({ loading: false, error: errorText(error, 'The preview could not be built.') }))
    }, 250)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [request])

  const data = state.data
  const roleName = data?.mentionRoleId ? (roles.find((r) => r.id === data.mentionRoleId)?.name || 'role') : null
  const now = formatTime(new Date(), timezone || deviceZone())

  return (
    <aside className="preview" aria-label={label}>
      <p className="preview-label">{label}{data?.race ? `: ${describeLead(leadMinutes).toLowerCase()} ${data.race.name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}` : ''}</p>
      {state.error && <StatusLine status={{ type: 'error', text: state.error }} />}
      {!state.error && data && !data.race && (
        <p className="empty-note">No upcoming session in the next 60 days matches these session types, so there is nothing to preview yet.</p>
      )}
      {!state.error && data?.race && (
        <div className="discord-message" aria-busy={state.loading}>
          <span className="discord-avatar" aria-hidden="true">F1</span>
          <div className="discord-name">
            F1 Calendar <span className="discord-app-tag">APP</span> <span className="discord-time">Today at {now}</span>
          </div>
          <div className="discord-body">
            {data.content && (
              <p>{data.content}<br /><span className="discord-mention">@{roleName}</span></p>
            )}
            <div className="discord-embed" style={{ '--embed-color': hex(data.embed.color) }}>
              <p className="discord-embed-title">{data.embed.title}</p>
              <p className="discord-embed-desc">{data.embed.description}</p>
              {data.embed.thumbnail && <img className="discord-embed-thumb" src={data.embed.thumbnail.url.replace(/^https?:\/\/[^/]+/, '')} alt="" />}
              <div className="discord-fields">
                {data.embed.fields.map((field) => (
                  <div key={field.name} className={field.inline ? 'discord-field' : 'discord-field discord-field--wide'}>
                    <div className="discord-field-name">{field.name}</div>
                    <div className="discord-field-value">{field.value}</div>
                  </div>
                ))}
              </div>
              <p className="discord-footer">{data.embed.footer?.text}</p>
            </div>
            <span className="discord-button">{data.button.label}</span>
          </div>
        </div>
      )}
    </aside>
  )
}

// ---------- server data ----------

function useServerData(guildId, botInGuild) {
  const [data, setData] = useState({ loading: true })

  const load = useCallback(async () => {
    setData((d) => ({ ...d, loading: true }))
    const settle = (promise) => promise.then((r) => ({ ok: true, value: r.data })).catch((error) => ({ ok: false, error }))
    // Without the bot, Discord will not list the server's channels or roles: asking would only produce an error.
    const none = Promise.resolve({ ok: true, value: [] })
    const [channels, roles, config, weather, notifications] = await Promise.all([
      botInGuild ? settle(axios.get(`/api/discord/guilds/${guildId}/channels`)) : none,
      botInGuild ? settle(axios.get(`/api/discord/guilds/${guildId}/roles`)) : none,
      settle(axios.get(`/api/discord/config/${guildId}`)),
      settle(axios.get(`/api/discord/weather-config/${guildId}`)),
      settle(axios.get(`/api/discord/notifications/${guildId}`))
    ])
    const failed = [channels, roles, config, weather, notifications].find((r) => !r.ok)
    setData({
      loading: false,
      error: failed ? errorText(failed.error, 'Some server settings could not be loaded.') : null,
      channels: channels.value || [],
      roles: roles.value || [],
      config: config.value || null,
      weather: weather.value || null,
      notifications: notifications.value || []
    })
  }, [guildId, botInGuild])

  // Runs again when the bot arrives, so the channel step has channels to offer.
  useEffect(() => {
    load()
  }, [load])

  return [data, load]
}

// ---------- guided first setup ----------

function SetupStep({ number, title, state, doneNote, onChange, children }) {
  return (
    <li className={`step step--${state}`} aria-current={state === 'current' ? 'step' : undefined}>
      <span className="step-number" aria-hidden="true">{state === 'done' ? <CheckIcon size={16} /> : number}</span>
      <h3 className="step-title">
        <span className="sr-only">Step {number}{state === 'done' ? ', done' : state === 'upcoming' ? ', not yet' : ''}: </span>
        {title}
      </h3>
      {state === 'done' && doneNote && (
        <p className="step-done-note">
          {doneNote}{' '}
          {onChange && <button type="button" className="text-button" onClick={onChange}>Change</button>}
        </p>
      )}
      {state === 'current' && <div className="step-body">{children}</div>}
    </li>
  )
}

function GuidedSetup({ guild, server, reload, onCheckBot, onFinish }) {
  const [reopened, setReopened] = useState(null)
  const [channelId, setChannelId] = useState(server.config?.channel_id || '')
  const [leads, setLeads] = useState(() => (server.notifications.length ? server.notifications.map((n) => n.lead_minutes) : [60, 15]))
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const [testSent, setTestSent] = useState(false)
  const [checking, setChecking] = useState(false)
  const timezone = server.config?.timezone || deviceZone()

  const done = {
    bot: guild.botInGuild,
    channel: Boolean(server.config?.channel_id),
    timings: server.notifications.length > 0,
    test: testSent
  }
  const order = ['bot', 'channel', 'timings', 'test']
  const firstOpen = order.find((key) => !done[key]) || null
  const current = reopened || firstOpen
  const stateOf = (key) => (key === current ? 'current' : done[key] ? 'done' : 'upcoming')
  const channelName = server.channels.find((c) => c.id === server.config?.channel_id)?.name

  const run = async (action, okText, failText) => {
    setBusy(true)
    setStatus(null)
    try {
      await action()
      setStatus(okText ? { type: 'ok', text: okText } : null)
      setReopened(null)
      await reload()
    } catch (error) {
      setStatus({ type: 'error', text: errorText(error, failText) })
    } finally {
      setBusy(false)
    }
  }

  const saveChannel = () => run(() => axios.post('/api/discord/config', {
    guild_id: guild.id,
    channel_id: channelId,
    lead_minutes: 60,
    timezone,
    role_id: server.config?.role_id || null,
    role_map: server.config?.role_map || {}
  }), null, 'The channel could not be saved.')

  const saveTimings = () => run(async () => {
    const existing = new Set(server.notifications.map((n) => n.lead_minutes))
    for (const lead of leads.filter((l) => !existing.has(l))) {
      await axios.post('/api/discord/notifications', { guild_id: guild.id, lead_minutes: lead, event_types: ALL_TYPES })
    }
  }, null, 'The reminder times could not be saved.')

  const sendTest = async () => {
    setBusy(true)
    setStatus(null)
    try {
      await axios.post('/api/discord/test-notification', { guild_id: guild.id })
      setTestSent(true)
      setStatus({ type: 'ok', text: `Test message sent to #${channelName || 'your channel'}. Check Discord: if it arrived, you are done.` })
    } catch (error) {
      setStatus({ type: 'error', text: `${errorText(error, 'The test message could not be sent.')} Make sure the bot can see and post in #${channelName || 'the channel'}.` })
    } finally {
      setBusy(false)
    }
  }

  // The server list reloads; when the bot is there, the server data reloads with it (useServerData).
  const checkBot = async () => {
    setChecking(true)
    setStatus(null)
    try {
      const list = await onCheckBot()
      if (!list?.find((g) => g.id === guild.id)?.botInGuild) {
        setStatus({ type: 'error', text: `The bot is not on ${guild.name} yet. Approve it in the Discord tab, then check again.` })
      }
    } catch (error) {
      setStatus({ type: 'error', text: errorText(error, 'Your servers could not be checked.') })
    } finally {
      setChecking(false)
    }
  }

  const toggleLead = (lead) => setLeads((list) => (list.includes(lead) ? list.filter((l) => l !== lead) : [...list, lead].sort((a, b) => b - a)))

  return (
    <div className="section-with-preview">
      <section className="section-stack" aria-labelledby="setup-title">
        <div>
          <h2 id="setup-title" className="panel-title">Set up reminders</h2>
          <p className="panel-hint">Four steps. Weather forecasts can be switched on afterwards.</p>
        </div>
        <ol className="steps">
          <SetupStep number={1} title="Add the bot to the server" state={stateOf('bot')} doneNote="The bot is on this server.">
            <p className="panel-hint">Discord opens in a new tab with this server selected. Approve the bot there, then come back.</p>
            <div className="button-row">
              <button type="button" className="button" onClick={() => openBotInvite(guild.id).catch((error) => setStatus({ type: 'error', text: errorText(error, 'The invite link could not be opened.') }))}>Add bot to {guild.name}</button>
              <button type="button" className="button button--secondary" onClick={checkBot} disabled={checking}><RefreshIcon size={18} />{checking ? 'Checking…' : 'I added it, check again'}</button>
            </div>
          </SetupStep>

          <SetupStep number={2} title="Choose the reminder channel" state={stateOf('channel')} doneNote={channelName ? `Reminders go to #${channelName}.` : null} onChange={() => setReopened('channel')}>
            <Field label="Channel" htmlFor="setup-channel" hint="The bot needs permission to post here.">
              <SearchableSelect id="setup-channel" value={channelId} onChange={setChannelId} options={channelOptions(server.channels)} placeholder="Select a channel" describedBy="setup-channel-hint" required />
            </Field>
            <div className="button-row">
              <button type="button" className="button" onClick={saveChannel} disabled={!channelId || busy}>Use this channel</button>
            </div>
          </SetupStep>

          <SetupStep number={3} title="Pick when reminders go out" state={stateOf('timings')} doneNote={done.timings ? `Reminders ${server.notifications.map((n) => describeLead(n.lead_minutes).toLowerCase()).join(', ')} every session.` : null} onChange={() => setReopened('timings')}>
            <fieldset className="check-group">
              <legend className="form-label" style={{ marginBottom: 8 }}>Send a reminder</legend>
              {LEAD_PRESETS.map((lead) => (
                <label key={lead} className="check-chip">
                  <input type="checkbox" checked={leads.includes(lead)} onChange={() => toggleLead(lead)} />
                  <span>{describeLead(lead)}</span>
                </label>
              ))}
            </fieldset>
            <p className="form-hint">For every session type. You can fine-tune times and session types later.</p>
            <div className="button-row">
              <button type="button" className="button" onClick={saveTimings} disabled={leads.length === 0 || busy}>Save reminder times</button>
            </div>
          </SetupStep>

          <SetupStep number={4} title="Send a test message" state={stateOf('test')} doneNote="Test message sent.">
            <p className="panel-hint">Posts a short test to #{channelName || 'your channel'} so you can see the bot works.</p>
            <div className="button-row">
              <button type="button" className="button" onClick={sendTest} disabled={busy}><SendIcon size={18} />Send test message</button>
            </div>
          </SetupStep>
        </ol>
        <StatusLine status={status} />
        {done.channel && done.timings && (
          <div className="button-row">
            <button type="button" className={done.test ? 'button' : 'button button--secondary'} onClick={onFinish}>{done.test ? 'Finish setup' : 'Skip the test and finish'}</button>
          </div>
        )}
      </section>
      {done.bot && (
        <MessagePreview
          leadMinutes={leads[0] ?? 60}
          eventTypes={ALL_TYPES}
          timezone={timezone}
          roleMap={server.config?.role_map || {}}
          roleId={server.config?.role_id || null}
          roles={server.roles}
        />
      )}
    </div>
  )
}

// ---------- configured server: sections ----------

function RemindersSection({ guild, server, reload, onDirtyChange }) {
  const initialConfig = useMemo(() => ({
    channel_id: server.config?.channel_id || '',
    timezone: server.config?.timezone || deviceZone(),
    role_map: server.config?.role_map || {}
  }), [server.config])
  const [config, setConfig] = useState(initialConfig)
  const [typeEdits, setTypeEdits] = useState({})
  const [newLead, setNewLead] = useState('')
  const [previewLead, setPreviewLead] = useState(server.notifications[0]?.lead_minutes ?? 60)
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => setConfig(initialConfig), [initialConfig])

  const configDirty = JSON.stringify(config) !== JSON.stringify(initialConfig)
  const timingsDirty = Object.keys(typeEdits).length > 0
  const dirty = configDirty || timingsDirty
  useEffect(() => onDirtyChange?.('reminders', dirty), [dirty, onDirtyChange])
  const typesOf = (n) => typeEdits[n.id] || n.event_types || ALL_TYPES

  const toggleType = (n, type) => {
    const current = typesOf(n)
    const next = current.includes(type) ? current.filter((t) => t !== type) : [...current, type]
    setTypeEdits((edits) => ({ ...edits, [n.id]: next }))
  }

  const save = async () => {
    if (Object.entries(typeEdits).some(([, types]) => types.length === 0)) {
      setStatus({ type: 'error', text: 'Each reminder time needs at least one session type. Remove the time instead if you no longer want it.' })
      return
    }
    setBusy(true)
    setStatus(null)
    try {
      if (configDirty) {
        await axios.post('/api/discord/config', { guild_id: guild.id, channel_id: config.channel_id, lead_minutes: 60, timezone: config.timezone, role_id: server.config?.role_id || null, role_map: config.role_map })
      }
      for (const [id, types] of Object.entries(typeEdits)) {
        const notification = server.notifications.find((n) => String(n.id) === id)
        if (!notification) continue
        await axios.delete(`/api/discord/notifications/${id}`)
        await axios.post('/api/discord/notifications', { guild_id: guild.id, lead_minutes: notification.lead_minutes, event_types: types })
      }
      setTypeEdits({})
      setStatus({ type: 'ok', text: 'Reminder settings saved.' })
      await reload()
    } catch (error) {
      setStatus({ type: 'error', text: errorText(error, 'The reminder settings could not be saved.') })
    } finally {
      setBusy(false)
    }
  }

  const discard = () => {
    setConfig(initialConfig)
    setTypeEdits({})
    setStatus(null)
  }

  const addLead = async (event) => {
    event.preventDefault()
    const lead = Number(newLead)
    if (!Number.isInteger(lead) || lead < 0 || lead > 1440) {
      setStatus({ type: 'error', text: 'Enter whole minutes between 0 (at the start) and 1440 (one day).' })
      return
    }
    if (server.notifications.some((n) => n.lead_minutes === lead)) {
      setStatus({ type: 'error', text: `There is already a reminder ${describeLead(lead).toLowerCase()}.` })
      return
    }
    setBusy(true)
    try {
      await axios.post('/api/discord/notifications', { guild_id: guild.id, lead_minutes: lead, event_types: ALL_TYPES })
      setNewLead('')
      setPreviewLead(lead)
      setStatus({ type: 'ok', text: `Reminder ${describeLead(lead).toLowerCase()} added.` })
      await reload()
    } catch (error) {
      setStatus({ type: 'error', text: errorText(error, 'The reminder time could not be added.') })
    } finally {
      setBusy(false)
    }
  }

  const removeLead = async (n) => {
    setBusy(true)
    try {
      await axios.delete(`/api/discord/notifications/${n.id}`)
      setTypeEdits(({ [n.id]: _removed, ...rest }) => rest)
      setStatus({ type: 'ok', text: `Reminder ${describeLead(n.lead_minutes).toLowerCase()} removed.` })
      await reload()
    } catch (error) {
      setStatus({ type: 'error', text: errorText(error, 'The reminder time could not be removed.') })
    } finally {
      setBusy(false)
    }
  }

  const previewTypes = (server.notifications.find((n) => n.lead_minutes === previewLead) && typesOf(server.notifications.find((n) => n.lead_minutes === previewLead))) || ALL_TYPES

  return (
    <div className="section-with-preview">
      <div className="section-stack">
        <section className="panel" aria-labelledby="where-title">
          <h2 id="where-title" className="panel-title">Channel and pings</h2>
          <div className="form-grid form-grid--two">
            <Field label="Reminder channel" htmlFor="rem-channel">
              <SearchableSelect id="rem-channel" value={config.channel_id} onChange={(v) => setConfig({ ...config, channel_id: v })} options={channelOptions(server.channels)} placeholder="Select a channel" required />
            </Field>
            <Field label="Timezone for times in messages" htmlFor="rem-zone">
              <select id="rem-zone" className="select" value={config.timezone} onChange={(e) => setConfig({ ...config, timezone: e.target.value })}>
                {TIMEZONES.map((zone) => <option key={zone} value={zone}>{zone.replace(/_/g, ' ')}</option>)}
              </select>
            </Field>
          </div>
          <fieldset className="form-grid form-grid--two" style={{ border: 0, padding: 0, minWidth: 0 }}>
            <legend className="form-label" style={{ marginBottom: 4 }}>Role to ping, per session type (optional)</legend>
            {EVENT_TYPES.map(([type, label]) => (
              <Field key={type} label={label} htmlFor={`role-${type}`}>
                <SearchableSelect id={`role-${type}`} value={config.role_map?.[type] || ''} onChange={(v) => setConfig({ ...config, role_map: { ...config.role_map, [type]: v } })} options={roleOptions(server.roles)} placeholder="No ping" />
              </Field>
            ))}
          </fieldset>
        </section>

        <section className="panel" aria-labelledby="timings-title">
          <div>
            <h2 id="timings-title" className="panel-title">Reminder times</h2>
            <p className="panel-hint">Each time sends one message before every session of the ticked types.</p>
          </div>
          {server.notifications.length === 0 && <p className="empty-note">No reminder times yet. Add one below; without one, nothing is sent.</p>}
          <ul className="list">
            {server.notifications.map((n) => (
              <li key={n.id} className="timing">
                <div className="timing-head">
                  <span className="timing-title">{describeLead(n.lead_minutes)}</span>
                  <div className="button-row">
                    <button type="button" className="text-button" onClick={() => setPreviewLead(n.lead_minutes)} aria-pressed={previewLead === n.lead_minutes}>
                      {previewLead === n.lead_minutes ? 'In preview' : 'Preview'}
                    </button>
                    <button type="button" className="icon-button" onClick={() => removeLead(n)} aria-label={`Remove the reminder ${describeLead(n.lead_minutes).toLowerCase()}`} disabled={busy}>
                      <TrashIcon />
                    </button>
                  </div>
                </div>
                <fieldset className="check-group">
                  <legend className="sr-only">Session types for the reminder {describeLead(n.lead_minutes).toLowerCase()}</legend>
                  {EVENT_TYPES.map(([type, label]) => (
                    <label key={type} className="check-chip">
                      <input type="checkbox" checked={typesOf(n).includes(type)} onChange={() => toggleType(n, type)} />
                      <span>{label}</span>
                    </label>
                  ))}
                </fieldset>
              </li>
            ))}
          </ul>
          <form className="input-suffix" onSubmit={addLead}>
            <label className="sr-only" htmlFor="new-lead">Minutes before the session</label>
            <input id="new-lead" className="input" type="number" min="0" max="1440" step="1" inputMode="numeric" value={newLead} onChange={(e) => setNewLead(e.target.value)} placeholder="30" />
            <span>minutes before</span>
            <button type="submit" className="button button--secondary" disabled={busy || newLead === ''}><PlusIcon size={18} />Add time</button>
          </form>
        </section>

        <StatusLine status={status} />
        {dirty && (
          <div className="unsaved-bar" role="region" aria-label="Unsaved changes">
            <p>You have unsaved changes.</p>
            <div className="button-row">
              <button type="button" className="button button--secondary" onClick={discard} disabled={busy}>Discard</button>
              <button type="button" className="button" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
            </div>
          </div>
        )}
      </div>
      <MessagePreview leadMinutes={previewLead} eventTypes={previewTypes} timezone={config.timezone} roleMap={config.role_map} roleId={server.config?.role_id || null} roles={server.roles} />
    </div>
  )
}

function WeatherSection({ guild, server, reload, onDirtyChange }) {
  const initial = useMemo(() => ({
    enabled: Boolean(server.weather?.enabled),
    channel_id: server.weather?.channel_id || '',
    role_id: server.weather?.role_id || '',
    race_day_lead_minutes: server.weather?.race_day_lead_minutes ?? ''
  }), [server.weather])
  const [form, setForm] = useState(initial)
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => setForm(initial), [initial])

  const dirty = JSON.stringify(form) !== JSON.stringify(initial)
  useEffect(() => onDirtyChange?.('weather', dirty), [dirty, onDirtyChange])

  const discard = () => {
    setForm(initial)
    setStatus(null)
  }

  const save = async (event) => {
    event?.preventDefault()
    const lead = form.race_day_lead_minutes === '' ? null : Number(form.race_day_lead_minutes)
    if (lead !== null && (!Number.isInteger(lead) || lead < 5 || lead > 1440)) {
      setStatus({ type: 'error', text: 'Race-day minutes must be between 5 and 1440, or empty to skip the race-day forecast.' })
      return
    }
    setBusy(true)
    setStatus(null)
    try {
      await axios.post('/api/discord/weather-config', { guild_id: guild.id, channel_id: form.channel_id || server.config?.channel_id, enabled: form.enabled, race_day_lead_minutes: lead, role_id: form.role_id || null })
      setStatus({ type: 'ok', text: form.enabled ? 'Weather forecasts are on.' : 'Weather settings saved. Forecasts are off.' })
      await reload()
    } catch (error) {
      setStatus({ type: 'error', text: errorText(error, 'The weather settings could not be saved.') })
    } finally {
      setBusy(false)
    }
  }

  const sendTest = async () => {
    setBusy(true)
    setStatus(null)
    try {
      await axios.post('/api/discord/weather-test', { guild_id: guild.id })
      setStatus({ type: 'ok', text: 'Weather test sent. Check the weather channel on Discord.' })
    } catch (error) {
      setStatus({ type: 'error', text: errorText(error, 'The weather test could not be sent.') })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel" aria-labelledby="weather-title">
      <div>
        <h2 id="weather-title" className="panel-title">Weather forecasts</h2>
        <p className="panel-hint">A forecast for the whole race weekend after midnight on its first day, and optionally one shortly before the race.</p>
      </div>
      <form className="form-grid" onSubmit={save}>
        <div className="switch-row">
          <label className="form-label" htmlFor="weather-on">Send weather forecasts</label>
          <span className="switch">
            <input id="weather-on" type="checkbox" role="switch" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
            <span aria-hidden="true" />
          </span>
        </div>
        <div className="form-grid form-grid--two">
          <Field label="Weather channel" htmlFor="weather-channel" hint="Best kept apart from the session reminders.">
            <SearchableSelect id="weather-channel" value={form.channel_id} onChange={(v) => setForm({ ...form, channel_id: v })} options={channelOptions(server.channels)} placeholder="Same as reminders" describedBy="weather-channel-hint" />
          </Field>
          <Field label="Role to ping (optional)" htmlFor="weather-role">
            <SearchableSelect id="weather-role" value={form.role_id} onChange={(v) => setForm({ ...form, role_id: v })} options={roleOptions(server.roles)} placeholder="No ping" />
          </Field>
          <Field label="Race-day forecast (optional)" htmlFor="weather-lead" hint="Minutes before the race, 5 to 1440. Empty skips it.">
            <div className="input-suffix">
              <input id="weather-lead" className="input" type="number" min="5" max="1440" step="1" inputMode="numeric" value={form.race_day_lead_minutes} onChange={(e) => setForm({ ...form, race_day_lead_minutes: e.target.value })} aria-describedby="weather-lead-hint" />
              <span>minutes before</span>
            </div>
          </Field>
        </div>
        <div className="button-row">
          <button className="button button--secondary" type="button" onClick={sendTest} disabled={busy || !server.weather || dirty}><SendIcon size={18} />Send weather test</button>
        </div>
        {!server.weather && !dirty && <p className="form-hint">Save weather settings once before sending a test.</p>}
        <StatusLine status={status} />
        {dirty && (
          <div className="unsaved-bar" role="region" aria-label="Unsaved weather changes">
            <p>You have unsaved changes.</p>
            <div className="button-row">
              <button type="button" className="button button--secondary" onClick={discard} disabled={busy}>Discard</button>
              <button type="submit" className="button" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
            </div>
          </div>
        )}
      </form>
    </section>
  )
}

function CheckSection({ guild, server }) {
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const channel = server.channels.find((c) => c.id === server.config?.channel_id)
  const weatherChannel = server.channels.find((c) => c.id === server.weather?.channel_id)
  const pings = EVENT_TYPES
    .map(([type, label]) => {
      const role = server.roles.find((r) => r.id === server.config?.role_map?.[type])
      return role ? `${label}: @${role.name}` : null
    })
    .filter(Boolean)

  const sendTest = async () => {
    setBusy(true)
    setStatus(null)
    try {
      await axios.post('/api/discord/test-notification', { guild_id: guild.id })
      setStatus({ type: 'ok', text: `Test message sent to #${channel?.name || 'your channel'}.` })
    } catch (error) {
      setStatus({ type: 'error', text: `${errorText(error, 'The test message could not be sent.')} Make sure the bot can post in #${channel?.name || 'the channel'}.` })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel" aria-labelledby="check-title">
      <div>
        <h2 id="check-title" className="panel-title">What is set up</h2>
        <p className="panel-hint">A summary of this server's reminders. Send a test to confirm the bot can post.</p>
      </div>
      <dl className="summary">
        <div><dt>Reminders go to</dt><dd>{channel ? `#${channel.name}` : 'No channel chosen'}</dd></div>
        <div><dt>Times in messages</dt><dd>{(server.config?.timezone || 'UTC').replace(/_/g, ' ')}</dd></div>
        <div><dt>Reminder times</dt><dd>{server.notifications.length ? server.notifications.map((n) => describeLead(n.lead_minutes)).join(', ') : 'None, so nothing is sent'}</dd></div>
        <div><dt>Role pings</dt><dd>{pings.length ? pings.join(' · ') : 'No pings'}</dd></div>
        <div><dt>Weather forecasts</dt><dd>{server.weather?.enabled ? `On, in #${weatherChannel?.name || channel?.name || 'the reminder channel'}` : 'Off'}</dd></div>
      </dl>
      <div className="button-row">
        <button type="button" className="button" onClick={sendTest} disabled={busy || !server.config}><SendIcon size={18} />Send test message</button>
      </div>
      <StatusLine status={status} />
    </section>
  )
}

const SECTIONS = [
  ['reminders', 'Reminders'],
  ['weather', 'Weather'],
  ['check', 'Check']
]

const WIDE_QUERY = '(min-width: 960px)'

function useWideLayout() {
  const [wide, setWide] = useState(() => window.matchMedia(WIDE_QUERY).matches)
  useEffect(() => {
    const list = window.matchMedia(WIDE_QUERY)
    const onChange = () => setWide(list.matches)
    list.addEventListener('change', onChange)
    return () => list.removeEventListener('change', onChange)
  }, [])
  return wide
}

function ServerPage({ guild, onBack, onCheckBot }) {
  const [server, reload] = useServerData(guild.id, guild.botInGuild)
  const wide = useWideLayout()
  const [section, setSection] = useState('reminders')
  const [dirty, setDirty] = useState({})
  const [confirmLeave, setConfirmLeave] = useState(false)
  // Decided once, when the settings first load: saving a step must not end the setup before its last step.
  const [setupMode, setSetupMode] = useState(null)
  const loaded = Boolean(server.channels)
  useEffect(() => {
    if (loaded && setupMode === null) {
      setSetupMode(!guild.botInGuild || !server.config || server.notifications.length === 0)
    }
  }, [loaded, setupMode, guild.botInGuild, server.config, server.notifications])
  const needsSetup = setupMode !== false

  const onDirtyChange = useCallback((key, value) => {
    setDirty((d) => (Boolean(d[key]) === value ? d : { ...d, [key]: value }))
  }, [])
  const anyDirty = Object.values(dirty).some(Boolean)

  // A reload or a closed tab would lose the edits too.
  useEffect(() => {
    if (!anyDirty) return undefined
    const warn = (event) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [anyDirty])

  const leave = () => (anyDirty ? setConfirmLeave(true) : onBack())

  // Desktop shows one section at a time; phones show all three stacked and the nav jumps between them.
  const goTo = (key) => {
    if (wide) {
      setSection(key)
      return
    }
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    document.getElementById(`section-${key}`)?.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' })
  }

  const unsavedParts = [dirty.reminders && 'reminders', dirty.weather && 'weather'].filter(Boolean).join(' and ')

  return (
    <>
      <button type="button" className="back-link text-button-reset" onClick={leave}><BackIcon size={18} />All servers</button>
      <div className="panel-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <ServerIcon guild={guild} />
          <h1 className="dash-title">{guild.name}</h1>
        </div>
      </div>
      {server.loading && !server.channels && <p className="empty-note" role="status">Loading this server's settings…</p>}
      {server.error && <StatusLine status={{ type: 'error', text: server.error }} />}
      {server.channels && (needsSetup ? (
        <GuidedSetup guild={guild} server={server} reload={reload} onCheckBot={onCheckBot} onFinish={() => setSetupMode(false)} />
      ) : (
        <div className="dash-layout">
          <nav className="section-nav" aria-label={wide ? 'Server settings' : 'Jump to a section'}>
            {SECTIONS.map(([key, label]) => (
              <button key={key} type="button" aria-current={wide && section === key ? 'page' : undefined} onClick={() => goTo(key)}>
                {label}
                {dirty[key] && <span className="unsaved-mark">Unsaved</span>}
              </button>
            ))}
          </nav>
          <div className="section-stack">
            {/* Hidden, not unmounted: switching sections keeps unsaved edits. */}
            <div id="section-reminders" className="section-anchor" hidden={wide && section !== 'reminders'}>
              <RemindersSection guild={guild} server={server} reload={reload} onDirtyChange={onDirtyChange} />
            </div>
            <div id="section-weather" className="section-anchor" hidden={wide && section !== 'weather'}>
              <WeatherSection guild={guild} server={server} reload={reload} onDirtyChange={onDirtyChange} />
            </div>
            <div id="section-check" className="section-anchor" hidden={wide && section !== 'check'}>
              <CheckSection guild={guild} server={server} />
            </div>
          </div>
        </div>
      ))}
      <ConfirmSheet
        open={confirmLeave}
        title="Leave without saving?"
        body={`Your changes to ${unsavedParts || 'this server'} on ${guild.name} have not been saved. Leaving discards them.`}
        confirmLabel="Discard and leave"
        onConfirm={() => {
          setConfirmLeave(false)
          onBack()
        }}
        onCancel={() => setConfirmLeave(false)}
      />
    </>
  )
}

// ---------- server list ----------

function ServerList({ guilds, loading, error, onOpen, onRefresh }) {
  const [query, setQuery] = useState('')
  const shown = guilds.filter((g) => g.name.toLowerCase().includes(query.trim().toLowerCase()))

  return (
    <section className="panel" aria-labelledby="servers-title">
      <div className="panel-head">
        <div>
          <h2 id="servers-title" className="panel-title">Your servers</h2>
          <p className="panel-hint">Servers you own or administer. Add the bot to a server, then set up its reminders.</p>
        </div>
        <button type="button" className="button button--secondary button--small" onClick={onRefresh} disabled={loading}><RefreshIcon size={16} />Refresh</button>
      </div>
      {guilds.length > 8 && (
        <label className="field">
          <SearchIcon size={18} />
          <span className="sr-only">Search your servers</span>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your servers" autoComplete="off" />
        </label>
      )}
      {loading && guilds.length === 0 && <p className="empty-note" role="status">Loading your servers…</p>}
      {error && <StatusLine status={{ type: 'error', text: error }} />}
      {!loading && !error && guilds.length === 0 && (
        <p className="empty-note">You do not own or administer any Discord server yet. Reminders can only be set up by a server's owner or an admin.</p>
      )}
      {!loading && guilds.length > 0 && shown.length === 0 && <p className="empty-note">No server matches “{query}”.</p>}
      <ul className="list">
        {shown.map((guild) => (
          <li key={guild.id} className="list-row">
            <ServerIcon guild={guild} />
            <div className="list-row-main">
              <span className="list-row-title">{guild.name}</span>
              <span className={`chip ${guild.botInGuild ? 'chip--live' : 'chip--soon'}`}>{guild.botInGuild ? 'Bot added' : 'Bot not added yet'}</span>
            </div>
            {/* Row actions stay neutral: one red fill per screen (DESIGN.md). */}
            <button type="button" className="button button--secondary button--small" onClick={() => onOpen(guild.id)} aria-label={`${guild.botInGuild ? 'Open' : 'Set up'} ${guild.name}`}>
              {guild.botInGuild ? 'Open' : 'Set up'}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

// ---------- page ----------

export default function DiscordDashboard() {
  const [auth, setAuth] = useState({ checked: false, user: null })
  const [guilds, setGuilds] = useState({ loading: false, list: [], error: null })
  const [selectedId, setSelectedId] = useState(null)

  useEffect(() => {
    axios.get('/api/discord/me')
      .then((r) => setAuth({ checked: true, user: r.data }))
      .catch(() => setAuth({ checked: true, user: null }))
  }, [])

  // Resolves to the fresh list, so the setup can tell whether the bot has arrived.
  const loadGuilds = useCallback(() => {
    setGuilds((g) => ({ ...g, loading: true, error: null }))
    return axios.get('/api/discord/admin-guilds', { params: { include: 'all' } })
      .then((r) => {
        setGuilds({ loading: false, list: r.data, error: null })
        return r.data
      })
      .catch((error) => {
        setGuilds((g) => ({ loading: false, list: g.list, error: errorText(error, 'Your servers could not be loaded.') }))
        throw error
      })
  }, [])

  useEffect(() => {
    if (auth.user) loadGuilds().catch(() => {})
  }, [auth.user, loadGuilds])

  const signOut = async () => {
    try {
      await axios.post('/api/discord/logout')
    } finally {
      setAuth({ checked: true, user: null })
      setSelectedId(null)
    }
  }

  const user = auth.user
  const account = user ? (
    <span className="account">
      {user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : <span className="avatar-fallback" aria-hidden="true">{user.username?.charAt(0).toUpperCase()}</span>}
      <span className="account-name">{user.username}</span>
      <button type="button" className="text-button" onClick={signOut}>Sign out</button>
    </span>
  ) : null

  const selected = guilds.list.find((g) => g.id === selectedId)

  return (
    <DashShell title={selected ? null : 'Discord reminders'} account={account}>
      {!auth.checked && <p className="empty-note" role="status">Checking your Discord session…</p>}
      {auth.checked && !user && (
        <section className="panel signin" aria-labelledby="discord-signin-title">
          <div>
            <h2 id="discord-signin-title" className="panel-title">Session reminders for your Discord server</h2>
            <p className="panel-hint">The F1 Calendar bot posts a reminder before every practice, qualifying, sprint and race, with role pings and weather if you want them. Sign in with the Discord account that owns or administers the server.</p>
          </div>
          <div className="button-row">
            <a className="button button--discord" href="/api/discord/login">Sign in with Discord</a>
          </div>
        </section>
      )}
      {user && !selected && (
        <>
          <p className="dash-intro">Signed in as {user.username}. Pick a server to set up or change its reminders.</p>
          <ServerList guilds={guilds.list} loading={guilds.loading} error={guilds.error} onOpen={setSelectedId} onRefresh={() => loadGuilds().catch(() => {})} />
        </>
      )}
      {user && selected && <ServerPage key={selected.id} guild={selected} onBack={() => setSelectedId(null)} onCheckBot={loadGuilds} />}
    </DashShell>
  )
}
