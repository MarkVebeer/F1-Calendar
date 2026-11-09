const axios = require('axios');
const ical = require('node-ical');
const db = require('./db');
const tzLookup = require('tz-lookup');
const { loadRegistry } = require('./tracks/registry');
const { matchEvent } = require('./tracks/matchEvent');
const { requestSyncForUnknownEvents } = require('./tracks/trackSync');

const ICS_URL = 'https://ics.ecal.com/ecal-sub/697a869dcce5a200022989fc/Formula%201.ics';
const ICS_TIMEOUT_MS = 30000;

async function syncCalendar() {
  try {
    console.log('Fetching calendar from:', ICS_URL);

    // Fetch ICS file
    const response = await axios.get(ICS_URL, { timeout: ICS_TIMEOUT_MS });
    const icsData = response.data;
    
    // Parse ICS data
    const events = await ical.async.parseICS(icsData);
    
    console.log(`Found ${Object.keys(events).length} events in calendar`);
    
    // Process and group events immediately
    const processedRaces = processAndGroupEvents(Object.values(events), loadRegistry());

    const unmatched = processedRaces.filter((race) => !race.circuit_id);
    if (unmatched.length > 0) {
      console.warn(`No circuit found for ${unmatched.length} calendar events, e.g. "${unmatched[0].raw_summary}"`);
      requestSyncForUnknownEvents();
    }

    if (processedRaces.length === 0) {
      throw new Error('Calendar contained no events, keeping existing races');
    }

    console.log(`Saving ${processedRaces.length} processed races to database`);
    await db.replaceRaces(processedRaces);

    console.log('Calendar sync completed successfully');
    return processedRaces;
  } catch (error) {
    console.error('Error syncing calendar:', error.message);
    throw error;
  }
}

function processAndGroupEvents(events, registry) {
  const races = [];
  const groupedByDate = {};
  
  // First pass: filter and organize events
  for (const event of events) {
    if (event.type === 'VEVENT') {
      const summary = event.summary || '';
      
      // Skip unwanted events
      if (summary.toLowerCase().includes('in your calendar')) {
        continue;
      }
      
      const eventDate = event.start ? new Date(event.start) : new Date();
      const eventEndDate = event.end ? new Date(event.end) : null;
      const dateKey = eventDate.toISOString().split('T')[0]; // YYYY-MM-DD
      
      if (!groupedByDate[dateKey]) {
        groupedByDate[dateKey] = [];
      }
      
      // Clean event name - extract just the Grand Prix and event type
      const cleanedName = cleanEventName(summary);
      
      // Match the event to a circuit from the local registry
      const originalLocation = (event.location || '').trim();
      const locationMatch = matchEvent({ summary, location: originalLocation, date: eventDate }, registry);
      
      let timezone = null;
      if (locationMatch.lat !== null && locationMatch.lat !== undefined && locationMatch.lon !== null && locationMatch.lon !== undefined) {
        try {
          timezone = tzLookup(locationMatch.lat, locationMatch.lon);
        } catch (error) {
          console.warn('Failed to determine timezone for location:', locationMatch.city || locationMatch.country, error.message);
        }
      }

      const race = {
        name: cleanedName,
        location: locationMatch.country,
        city: locationMatch.city,
        circuit_name: locationMatch.circuit_name,
        circuit_id: locationMatch.circuit_id,
        lat: locationMatch.lat ?? null,
        lon: locationMatch.lon ?? null,
        timezone,
        date: eventDate.toISOString(),
        end_date: eventEndDate ? eventEndDate.toISOString() : null,
        type: determineRaceType(summary),
        ics_uid: event.uid || `${Date.now()}-${Math.random()}`,
        raw_summary: summary
      };
      
      groupedByDate[dateKey].push(race);
    }
  }
  
  // Second pass: merge grouped events by date and create final races
  for (const [date, dayEvents] of Object.entries(groupedByDate)) {
    // Sort by type priority for better organization
    dayEvents.sort((a, b) => getTypePriority(a.type) - getTypePriority(b.type));
    
    for (const event of dayEvents) {
      races.push(event);
    }
  }
  
  // Sort final races by date
  races.sort((a, b) => new Date(a.date) - new Date(b.date));
  
  return races;
}

function cleanEventName(summary) {
  let name = summary;
  
  // Remove everything before the first letter (emojis, spaces, etc.)
  name = name.replace(/^[^A-Za-z0-9]+/, '').trim();
  
  // Remove "Formula 1" or "F1" prefix (case insensitive)
  name = name.replace(/^(Formula\s*1|F1)\s*/i, '').trim();
  
  // Remove event type suffixes and everything after them
  name = name.replace(/\s*-\s*(Practice|Qualifying|Sprint|Race|Quali|FP\d+).*$/gi, '');
  name = name.replace(/\s+(Practice|Qualifying|Sprint|Race|Quali|FP\d+).*$/gi, '');
  
  // Remove trailing numbers and extra whitespace
  name = name.replace(/\s+\d+\s*$/g, '').trim();
  
  return name || summary;
}

function determineRaceType(summary) {
  const lower = summary.toLowerCase();
  if (lower.includes('practice') || lower.includes('fp')) {
    return 'practice';
  } else if (lower.includes('qualifying') || lower.includes('quali')) {
    return 'qualifying';
  } else if (lower.includes('sprint')) {
    return 'sprint';
  } else if (lower.includes('race') || lower.includes('grand prix') || lower.includes('gp')) {
    return 'race';
  }
  return 'other';
}

function getTypePriority(type) {
  const priority = {
    'practice': 1,
    'qualifying': 2,
    'sprint': 3,
    'race': 4,
    'other': 5
  };
  return priority[type] || 5;
}

module.exports = {
  syncCalendar
};
