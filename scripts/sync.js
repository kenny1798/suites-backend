// Ganti kod penuh dalam: /scripts/sync.js

// Import objek 'db' dari lokasi yang betul
const db = require('../packages/database-models');

// Fungsi utama untuk jalankan sync
const syncDatabase = async () => {
  console.log('Starting database sync...');
  try {
    // Pilihan 'alter: true' akan cuba ubah suai table sedia ada.
    await db.sequelize.sync({ alter: true });

    console.log('✅ Database synchronized successfully.');
  } catch (error) {
    console.error('❌ Error synchronizing database:', error);
  } finally {
    // Tutup sambungan database selepas selesai
    await db.sequelize.close();
  }
};

// Jalankan fungsi
syncDatabase();