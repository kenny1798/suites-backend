// server/scripts/dbSync.js
require('dotenv').config();
const { sequelize } = require('@suites/database-models');

(async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ DB connected');

    const force = process.argv.includes('--force');
    const alter = process.argv.includes('--alter');

    // Kalau DB kosong, dua² ok. --force drop & recreate tables, --alter cuba migrate shape.
    await sequelize.sync({ force: force || false, alter: alter || false });

    console.log(`✅ sequelize.sync done (${force ? 'force' : alter ? 'alter' : 'safe'})`);
    process.exit(0);
  } catch (e) {
    console.error('❌ sync failed:', e);
    process.exit(1);
  }
})();
