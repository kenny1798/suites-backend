// salestrack-service/models/Teams.js
module.exports = (sequelize, DataTypes) => {
  const Teams = sequelize.define('Teams', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    ownerId: { 
      type: DataTypes.INTEGER, 
      allowNull: false, 
      references: { model: 'users', key: 'id' }
    },
  }, { tableName: 'st_teams', paranoid: true });

  Teams.associate = (models) => {
    Teams.belongsTo(models.Users, { as: 'Owner', foreignKey: 'ownerId' });

    Teams.hasMany(models.TeamMembers, { foreignKey: 'teamId', onDelete: 'CASCADE' });
    Teams.hasMany(models.Contacts, { foreignKey: 'teamId', onDelete: 'CASCADE' });
    Teams.hasMany(models.Opportunities, { foreignKey: 'teamId', onDelete: 'CASCADE' });
    Teams.hasMany(models.Products, { foreignKey: 'teamId', onDelete: 'CASCADE' });
    Teams.hasMany(models.Tags, { foreignKey: 'teamId', onDelete: 'CASCADE' });
    Teams.hasMany(models.OpportunityStatuses, { foreignKey: 'teamId', onDelete: 'CASCADE' });

    // NEW: relations untuk tasks & attempts (optional)
    Teams.hasMany(models.Tasks, { foreignKey: 'teamId', onDelete: 'CASCADE' });
    Teams.hasMany(models.FollowUpAttempts, { foreignKey: 'teamId', onDelete: 'CASCADE' });
  };

  return Teams;
};
