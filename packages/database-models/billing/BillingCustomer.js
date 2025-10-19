// models/BillingCustomer.js
module.exports = (sequelize, DataTypes) => {
    const BillingCustomer = sequelize.define('BillingCustomer', {
      userId: { type: DataTypes.INTEGER, allowNull: false },
      stripeCustomerId: { type: DataTypes.STRING, allowNull: false, unique: true },
    }, {
      tableName: 'billing_customers',
      indexes: [
        { unique: true, fields: ['stripeCustomerId'] },
        { fields: ['userId'] },
      ],
    });

    BillingCustomer.associate = (models) => {
      // Satu rekod BillingCustomer milik seorang User
      BillingCustomer.belongsTo(models.Users, { foreignKey: 'userId' });
    };
    return BillingCustomer;
  };
  