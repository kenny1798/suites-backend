// models/Feature.js
module.exports = (sequelize, DataTypes) => {
  const Feature = sequelize.define('Feature', {
    key: { type: DataTypes.STRING, primaryKey: true },
    name: DataTypes.STRING,
    description: DataTypes.TEXT,
  }, {
    tableName: 'features',
    timestamps: false // Table definisi selalunya tak perlukan timestamps
  });

  // <<< TAMBAHAN DI SINI
  Feature.associate = (models) => {
    // Satu Feature boleh ada dalam banyak Pelan, melalui table PlanFeature
    Feature.hasMany(models.PlanFeature, { foreignKey: 'featureKey', sourceKey: 'key' });
  };
  // >>> AKHIR TAMBAHAN

  return Feature;
};