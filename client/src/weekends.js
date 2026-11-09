const FINISHED_AFTER_LAST_EVENT_MS = 3 * 60 * 60 * 1000

export function buildWeekendTimeline(groupedRaces) {
  return Object.entries(groupedRaces)
    .map(([key, grandPrix]) => {
      const sortedEvents = [...grandPrix.events].sort((a, b) => new Date(a.date) - new Date(b.date))
      if (sortedEvents.length === 0) {
        return null
      }

      const firstEvent = sortedEvents[0]
      const lastEvent = sortedEvents[sortedEvents.length - 1]

      return {
        key,
        grandPrix,
        firstEvent,
        lastEvent,
        startMs: new Date(firstEvent.date).getTime(),
        currentWindowEndMs: new Date(lastEvent.date).getTime() + FINISHED_AFTER_LAST_EVENT_MS
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.startMs - b.startMs)
}

export function isWeekendFinished(weekend, nowMs) {
  return nowMs >= weekend.currentWindowEndMs
}

// Everything still to come, preceded by the most recent finished weekends.
export function selectVisibleWeekends(timeline, nowMs, pastCount) {
  const finished = timeline.filter(weekend => isWeekendFinished(weekend, nowMs))
  const remaining = timeline.filter(weekend => !isWeekendFinished(weekend, nowMs))
  return [...(pastCount > 0 ? finished.slice(-pastCount) : []), ...remaining]
}

export function groupBySeason(weekends) {
  const seasons = new Map()
  for (const weekend of weekends) {
    const { season } = weekend.grandPrix
    if (!seasons.has(season)) {
      seasons.set(season, [])
    }
    seasons.get(season).push(weekend)
  }
  return [...seasons.entries()]
    .sort(([a], [b]) => a - b)
    .map(([season, seasonWeekends]) => ({ season, weekends: seasonWeekends }))
}
