// salestrack-service/models/Tags.js
module.exports = (sequelize, DataTypes) => {
  const Tags = sequelize.define('Tags', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    color: { type: DataTypes.STRING, defaultValue: '#E2E8F0' },

    // <<< PENAMBAHBAIKAN DI SINI
    teamId: { type: DataTypes.INTEGER, allowNull: false },
    // >>> AKHIR PENAMBAHBAIKAN

  }, { 
    tableName: 'st_tags',
    indexes: [{ unique: true, fields: ['teamId', 'name'] }]
  });
 
  Tags.associate = (models) => {
    Tags.belongsTo(models.Teams, { foreignKey: 'teamId' });
    Tags.belongsToMany(models.Contacts, { through: 'st_contact_tags', foreignKey: 'tagId' });
  };
 
  return Tags;
};