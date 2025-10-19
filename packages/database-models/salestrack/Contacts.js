// packages/database-models/salestrack/Contacts.js
module.exports = (sequelize, DataTypes) => {
  const Contacts = sequelize.define('Contacts', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },

    name:  { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: true, validate: { isEmail: true } }, // ❌ tiada unique
    phonecc: { type: DataTypes.STRING, allowNull: true },
    phone: { type: DataTypes.STRING, allowNull: true },
    source:{ type: DataTypes.STRING },

    userId: { type: DataTypes.INTEGER, allowNull: false },
    teamId: { type: DataTypes.INTEGER, allowNull: false },
  }, {
    tableName: 'st_contacts',
    paranoid: true,
    indexes: [
      // ✅ kekalkan unique phone per (teamId, userId)
      { unique: true, fields: ['teamId', 'userId', 'phone'], name: 'st_contacts_team_user_phone_unique' },

      // 🔎 index biasa untuk carian/penggunaan WHERE
      { fields: ['teamId'], name: 'st_contacts_team_id' },
      { fields: ['userId'], name: 'st_contacts_user_id' },
      { fields: ['name'],   name: 'st_contacts_name' },
      { fields: ['phone'],  name: 'st_contacts_phone' },
      { fields: ['email'],  name: 'st_contacts_email' }, // ← non-unique
    ],
  });

  Contacts.associate = (models) => {
    Contacts.belongsTo(models.Users, { as: 'Owner', foreignKey: 'userId' });
    Contacts.belongsTo(models.Teams,  { foreignKey: 'teamId' });
    Contacts.hasMany(models.Opportunities, { foreignKey: 'contactId' });
    Contacts.belongsToMany(models.Tags, { through: models.ContactTags, foreignKey: 'contactId' });
  };

  return Contacts;
};
