// packages/database-models/index.js (Versi Dinaik Taraf)

'use strict';
const fs = require('fs');
const path = require('path');
const Sequelize = require('sequelize');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const db = {};

// Sambungan ke database kekal sama
const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASS,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    dialect: 'mysql',
    logging: false,
  }
);

// === BAHAGIAN BARU YANG PINTAR ===
// Fungsi baru untuk cari semua fail model secara rekursif dalam subfolder
const findModelFiles = (dir) => {
  let files = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });

  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      files = [...files, ...findModelFiles(fullPath)];
    } else if (item.name.slice(-3) === '.js' && item.name !== 'index.js') {
      files.push(fullPath);
    }
  }
  return files;
};

// Guna fungsi baru untuk dapatkan senarai semua fail model
const modelFiles = findModelFiles(__dirname);

// Muatkan setiap model dari senarai fail yang dijumpai
for (const file of modelFiles) {
  const model = require(file)(sequelize, Sequelize.DataTypes);
  db[model.name] = model;
}
// ==================================

// Bahagian 'associate' kekal sama, ia akan berfungsi seperti biasa
Object.keys(db).forEach(modelName => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;