// models/Plan.js
module.exports = (sequelize, DataTypes) => {
  const Plan = sequelize.define('Plan', {
    code: { type: DataTypes.STRING, primaryKey: true },
    name: DataTypes.STRING,
    type: DataTypes.ENUM('FREE_FOREVER','FREEMIUM','PRO','PAY_TO_USE'),
    priceCents: { type: DataTypes.INTEGER, defaultValue: 0 },
    interval: DataTypes.ENUM('one_time','month','year'),
    trialDays: { type: DataTypes.INTEGER, allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    stripePriceId: { type: DataTypes.STRING, allowNull: true },
    seats: { type: DataTypes.INTEGER, allowNull: true },
    toolId: { type: DataTypes.STRING, allowNull: true },
  }, {
    tableName: 'plans',
    timestamps: false, // Table definisi selalunya tak perlukan timestamps
    indexes: [
      { fields: ['isActive'] },
      { fields: ['toolId'] },
      { fields: ['stripePriceId'] },
    ],
  });

  // <<< TAMBAHAN DI SINI
  Plan.associate = (models) => {
    // Satu Pelan ada banyak Ciri, melalui table PlanFeature
    Plan.hasMany(models.PlanFeature, { foreignKey: 'planCode', sourceKey: 'code' });
    // Satu Pelan boleh dilanggan banyak kali, melalui table ToolSubscription
    Plan.hasMany(models.ToolSubscription, { foreignKey: 'planCode', sourceKey: 'code' });
  };
  // >>> AKHIR TAMBAHAN

  return Plan;
};