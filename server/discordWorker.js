require('dotenv').config();
const db = require('./db');
const discordDb = require('./discordDb');
const { startDiscordPresence } = require('./discordPresence');
const { sendChannelMessage } = require('./discordService');

const WORKER_INTERVAL_MS = 60 * 1000;
const PUBLIC_APP_URL = (process.env.PUBLIC_APP_URL || 'https://f1.markveber.hu').replace(/\/+$/, '');

async function buildRaceEmbed(race, config, leadMinutes) {
  const start = new Date(race.date);
  const locale = 'en-GB';
  const eventLabel = getEventTypeLabel(race.type);

  // Different message based on lead_minutes
  let description;
  if (leadMinutes === 0) {
    description = `🚦 ${eventLabel} is starting now!`;
  } else if (leadMinutes === 1) {
    description = `${eventLabel} starts in 1 minute!`;
  } else if (leadMinutes < 60) {
    description = `${eventLabel} starts in ${leadMinutes} minutes!`;
  } else {
    const hours = Math.floor(leadMinutes / 60);
    const minutes = leadMinutes % 60;
    if (minutes === 0) {
      description = `${eventLabel} starts in ${hours} hour${hours === 1 ? '' : 's'}!`;
    } else {
      description = `${eventLabel} starts in ${hours} hour${hours === 1 ? '' : 's'} and ${minutes} minute${minutes === 1 ? '' : 's'}!`;
    }
  }

  // Build location info
  let locationValue = race.location || '—';
  if (race.city) {
    locationValue = `${race.location}, ${race.city}`;
  }

  const fields = [
    { name: 'Type', value: getEventTypeName(race.type), inline: true },
    { name: 'Start', value: start.toLocaleString(locale, { timeZone: config.timezone }), inline: true },
    { name: 'Location', value: locationValue, inline: false }
  ];

  if (race.circuit_name) {
    fields.push({ name: '🏎️ Circuit', value: race.circuit_name, inline: false });
  }

  const embed = {
    title: `🏁 ${race.name}`,
    description: description,
    color: getColorForType(race.type),
    fields: fields,
    footer: { text: 'F1 Calendar • Discord Notify' }
  };

  if (race.circuit_id) {
    embed.thumbnail = { url: `${PUBLIC_APP_URL}/api/tracks/${race.circuit_id}.png` };
  }

  return embed;
}

function getEventTypeName(type) {
  switch(type) {
    case 'race': return '🏁 Race';
    case 'qualifying': return '⏱️ Qualifying';
    case 'practice': return '🔧 Practice';
    case 'sprint': return '⚡ Sprint';
    case 'custom': return '📝 Custom';
    default: return type;
  }
}

function getEventTypeLabel(type) {
  switch(type) {
    case 'race': return '🏁 Race';
    case 'qualifying': return '⏱️ Qualifying';
    case 'practice': return '🔧 Practice';
    case 'sprint': return '⚡ Sprint';
    case 'custom': return '📝 Custom event';
    default: return '📅 Event';
  }
}

function getColorForType(type) {
  switch(type) {
    case 'race': return 0xe10600;      // F1 Red
    case 'qualifying': return 0xf093fb; // Pink
    case 'practice': return 0x667eea;   // Blue
    case 'sprint': return 0xfad961;     // Yellow
    case 'custom': return 0xa0a0a8;     // Gray
    default: return 0xe10600;
  }
}

async function sendMessageWithRetry(channelId, embed, roleId, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await sendChannelMessage(channelId, embed, roleId);
      return true;
    } catch (error) {
      console.error(`Attempt ${attempt}/${maxRetries} failed for channel ${channelId}:`, error.message);
      
      if (attempt < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s
        const waitTime = Math.pow(2, attempt - 1) * 1000;
        await new Promise(resolve => setTimeout(resolve, waitTime));
      } else {
        throw error;
      }
    }
  }
}

async function runDiscordNotifications() {
  try {
    const configs = await discordDb.getDiscordConfigs();
    if (configs.length === 0) {
      return;
    }

    const windowHours = 168;
    const now = new Date();
    const until = new Date(now.getTime() + windowHours * 60 * 60 * 1000);
    
    const races = await db.getUpcomingEvents(windowHours); // next 7 days (+ 5 min lookback)
    if (races.length === 0) {
      return;
    }

    const windowMs = WORKER_INTERVAL_MS;

    for (const config of configs) {
      // Fetch all notifications for this guild
      const notifications = await discordDb.getNotificationsByGuild(config.guild_id);
      if (notifications.length === 0) {
        continue;
      }

      for (const race of races) {
        const raceTime = new Date(race.date).getTime();
        const now = Date.now();

        for (const notification of notifications) {
          // Check if this event type is in the allowed types
          if (!notification.event_types.includes(race.type)) {
            continue;
          }

          const notifyAt = raceTime - notification.lead_minutes * 60 * 1000;

          // Check if we're in the worker interval window
          if (now < notifyAt || now > notifyAt + windowMs) {
            continue;
          }

          const alreadySent = await discordDb.wasDiscordNotified({ 
            guild_id: config.guild_id, 
            race_id: race.id,
            lead_minutes: notification.lead_minutes
          });
          if (alreadySent) {
            continue;
          }

          try {
            const embed = await buildRaceEmbed(race, config, notification.lead_minutes);
            const roleIdForType = config.role_map?.[race.type] || config.role_id || null;
            await sendMessageWithRetry(config.channel_id, embed, roleIdForType);
            await discordDb.logDiscordNotification({
              guild_id: config.guild_id,
              race_id: race.id,
              channel_id: config.channel_id,
              lead_minutes: notification.lead_minutes,
              scheduled_for: new Date(notifyAt).toISOString()
            });
            console.log(`Notification sent for ${race.name} in guild ${config.guild_id} (${notification.lead_minutes} min before)`);
          } catch (error) {
            console.error(`Failed to send notification for ${race.name} in guild ${config.guild_id}:`, error.message);
          }
        }
      }
    }
  } catch (error) {
    console.error('Discord notification worker error:', error.message || error);
  }
}

function startDiscordWorker() {
  console.log('Discord notification worker started');
  startDiscordPresence();
  runDiscordNotifications();
  setInterval(runDiscordNotifications, WORKER_INTERVAL_MS);
}

if (require.main === module) {
  Promise.all([db.initDatabase(), discordDb.initDiscordDatabase()])
    .then(() => startDiscordWorker())
    .catch((error) => {
      console.error('Failed to start discord worker:', error);
    });
}

module.exports = { startDiscordWorker, runDiscordNotifications, buildRaceEmbed };
