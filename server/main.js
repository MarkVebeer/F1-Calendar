// Development entry point. It exports nothing, so Bun does not try to auto-serve it.
const { startServer } = require('./index');

startServer().catch((error) => {
  console.error('Fatal startup error:', error);
  process.exit(1);
});
