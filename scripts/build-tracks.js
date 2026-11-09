const { buildSeed } = require('../server/tracks/trackSync');

buildSeed()
  .then(({ circuits, generated, missing }) => {
    console.log(`Seed ready: ${circuits} circuits, ${generated} tracks written.`);
    if (missing.length > 0) {
      console.log(`Without geometry: ${missing.join(', ')}`);
    }
  })
  .catch((error) => {
    console.error('Seed build failed:', error.message || error);
    process.exit(1);
  });
