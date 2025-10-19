// models/Subscription.js
module.exports = (sequelize, DataTypes) => {
  const Subscription = sequelize.define('Subscription', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    status: {
      type: DataTypes.ENUM('active','trialing','past_due','canceled','expired'),
      allowNull: false,
    },
    currentPeriodEnd: { type: DataTypes.DATE, allowNull: true },
    trialEnd: { type: DataTypes.DATE, allowNull: true },
    cancelAt: { type: DataTypes.DATE, allowNull: true },
    billingAnchorDay: { type: DataTypes.INTEGER, allowNull: true },
    provider: { type: DataTypes.ENUM('manual','stripe','billplz'), defaultValue: 'manual' },
    providerRef: { type: DataTypes.STRING, allowNull: true },
  }, {
    tableName: 'subscriptions',
    indexes: [
      { fields: ['userId', 'status'] },
      { fields: ['provider', 'providerRef'] },
      { fields: ['providerRef'] },
    ],
  });

  // <<< TAMBAHAN DI SINI
  Subscription.associate = (models) => {
    // Satu 'Subscription' induk milik seorang 'User'
    Subscription.belongsTo(models.Users, { foreignKey: 'userId' });

    // Satu 'Subscription' induk boleh ada banyak 'ToolSubscription' (langganan tool individu)
    Subscription.hasMany(models.ToolSubscription, { 
      foreignKey: 'providerSubRef', 
      sourceKey: 'providerRef' 
    });
  };
  // >>> AKHIR TAMBAHAN

  return Subscription;
};