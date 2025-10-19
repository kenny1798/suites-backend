// models/ToolSubscription.js
module.exports = (sequelize, DataTypes) => {
  const ToolSubscription = sequelize.define('ToolSubscription', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    toolId: { type: DataTypes.STRING, allowNull: false },
    planCode: { type: DataTypes.STRING, allowNull: false },
    status: {
      type: DataTypes.ENUM('active','trialing','past_due','canceled','expired'),
      allowNull: false,
      defaultValue: 'trialing',
    },
    trialEnd: { type: DataTypes.DATE, allowNull: true },
    startedAt: { type: DataTypes.DATE, allowNull: true },
    cancelAt: { type: DataTypes.DATE, allowNull: true },
    provider: { type: DataTypes.ENUM('manual','stripe','billplz'), defaultValue: 'manual' },
    providerSubRef: { type: DataTypes.STRING, allowNull: true },
    providerItemRef: { type: DataTypes.STRING, allowNull: true, unique: true }, // unique:true adalah amalan baik
    currentPeriodEnd: { type: DataTypes.DATE, allowNull: true },
  }, {
    tableName: 'tool_subscriptions',
    indexes: [
      { fields: ['userId', 'status'] },
      { fields: ['toolId'] },
      { unique: true, fields: ['userId','toolId'] },
      { fields: ['providerSubRef'] },
    ],
  });

  // <<< TAMBAHAN DI SINI
  ToolSubscription.associate = (models) => {
    ToolSubscription.belongsTo(models.Users, { foreignKey: 'userId' });
    ToolSubscription.belongsTo(models.Tool, { foreignKey: 'toolId', targetKey: 'slug' });
    ToolSubscription.belongsTo(models.Plan, { foreignKey: 'planCode', targetKey: 'code' });
    ToolSubscription.belongsTo(models.Subscription, { foreignKey: 'providerSubRef', targetKey: 'providerRef' });
  };
  // >>> AKHIR TAMBAHAN

  return ToolSubscription;
};