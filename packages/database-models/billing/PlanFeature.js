// models/PlanFeature.js
module.exports = (sequelize, DataTypes) => {
  const PlanFeature = sequelize.define('PlanFeature', {
    planCode: { type: DataTypes.STRING, allowNull: false, primaryKey: true },   // Jadikan sebahagian dari composite PK
    featureKey: { type: DataTypes.STRING, allowNull: false, primaryKey: true }, // Jadikan sebahagian dari composite PK
    enabled: { type: DataTypes.BOOLEAN, defaultValue: true },
    limitInt: { type: DataTypes.INTEGER, allowNull: true },
  }, {
    tableName: 'plan_features',
    timestamps: false, // Table jenis ni selalunya tak perlukan timestamps
    indexes: [
      { unique: true, fields: ['planCode', 'featureKey'] },
    ],
  });

  // <<< TAMBAHAN DI SINI
  PlanFeature.associate = (models) => {
    // Definisi hubungan balik ke 'parent' tables
    PlanFeature.belongsTo(models.Plan, { foreignKey: 'planCode', targetKey: 'code' });
    PlanFeature.belongsTo(models.Feature, { foreignKey: 'featureKey', targetKey: 'key' });
  };
  // >>> AKHIR TAMBAHAN

  return PlanFeature;
};