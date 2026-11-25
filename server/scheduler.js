const cron = require('node-cron');
const { syncCalendar } = require('./icsParser');
const { runDiscordNotifications } = require('./discordWorker');
const { runWeatherNotifications, runRaceDayWeatherNotifications } = require('./weatherWorker');
const { trackSync } = require('./tracks/trackSync');
const { refreshWeatherForecasts } = require('./weatherForecasts');

async function refreshWeather() {
  try {
    const result = await refreshWeatherForecasts();
    if (result.saved !== undefined) {
      console.log(`Weather forecasts refreshed: ${result.saved} of ${result.weekends} weekends`);
    }
  } catch (error) {
    console.error('Weather forecast refresh failed:', error.message || error);
  }
}

async function refreshTracks() {
  try {
    const { changed } = await trackSync();
    if (changed) {
      await syncCalendar();
    }
  } catch (error) {
    console.error('Track sync failed, keeping existing track data:', error.message || error);
  }
}

function startScheduler() {
  // Refresh circuits and track drawings once a day
  cron.schedule('15 4 * * *', refreshTracks);

  // Run calendar sync every hour at minute 0
  cron.schedule('0 * * * *', async () => {
    console.log('Running scheduled calendar sync...');
    try {
      await syncCalendar();
      console.log('Scheduled sync completed');
    } catch (error) {
      console.error('Scheduled sync failed:', error);
    }
  });

  // Refresh the on-site weather forecasts every 3 hours
  cron.schedule('20 */3 * * *', refreshWeather);

  // Run Discord notifications check every minute
  cron.schedule('* * * * *', async () => {
    try {
      await runDiscordNotifications();
      await runWeatherNotifications();
      await runRaceDayWeatherNotifications();
    } catch (error) {
      console.error('Discord notification check failed:', error);
    }
  });
  
  console.log('Cron scheduler initialized - calendar sync hourly, Discord notifications every minute');
}

module.exports = {
  refreshTracks,
  refreshWeather,
  startScheduler
};
