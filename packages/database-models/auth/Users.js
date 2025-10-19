// models/Users.js
module.exports = (sequelize, DataTypes) => {
  const Users = sequelize.define('Users', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    uuid: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, allowNull: false, unique: true },
    googleId: { type: DataTypes.STRING, allowNull: true, unique: true },
    email: { type: DataTypes.STRING, allowNull: false, unique: true, validate: { isEmail: true } },
    name: { type: DataTypes.STRING, allowNull: false },
    password: { type: DataTypes.STRING, allowNull: true },
    phoneNumber: { type: DataTypes.STRING, allowNull: true },
    isValidated: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    resetPasswordToken: { type: DataTypes.STRING, allowNull: true },
    resetPasswordExpires: { type: DataTypes.DATE, allowNull: true },
  }, {
    tableName: 'users',
    indexes: [
      { unique: true, fields: ['email'] },
      { unique: true, fields: ['googleId'] },
    ],
  });

  // <<< TAMBAHAN DI SINI
  Users.associate = (models) => {
    // Hubungan Sistem Billing & Auth
    Users.hasMany(models.Subscription, { foreignKey: 'userId' });
    Users.hasMany(models.ToolSubscription, { foreignKey: 'userId' });
    Users.hasOne(models.BillingCustomer, { foreignKey: 'userId' });

    // Hubungan Sistem SalesTrack
    Users.hasMany(models.TeamMembers, { foreignKey: 'userId' });
    Users.hasMany(models.Contacts, { foreignKey: 'userId', as: 'OwnedContacts' });
    Users.hasMany(models.Opportunities, { foreignKey: 'userId', as: 'OwnedOpportunities' });
    Users.hasMany(models.Activities, { foreignKey: 'userId' });
    Users.hasMany(models.Targets, { foreignKey: 'userId' });
  };
  // >>> AKHIR TAMBAHAN

  return Users;
};