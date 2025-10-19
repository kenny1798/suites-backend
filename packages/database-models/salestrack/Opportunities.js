// salestrack-service/models/Opportunities.js
module.exports = (sequelize, DataTypes) => {
  const Opportunities = sequelize.define('Opportunities', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    value: { type: DataTypes.INTEGER, defaultValue: 0 },
    isOnHold: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
    closedAt: { type: DataTypes.DATE },
    lostReason: { type: DataTypes.STRING },

    // EXISTING FKs
    statusId: { type: DataTypes.INTEGER, allowNull: true },
    contactId: { type: DataTypes.INTEGER, allowNull: false },
    userId: { type: DataTypes.INTEGER, allowNull: false }, // owner
    teamId: { type: DataTypes.INTEGER, allowNull: false },

    // NEW FIELDS
    nextFollowUpAt: { type: DataTypes.DATE, allowNull: true },
    lastActivityAt: { type: DataTypes.DATE, allowNull: true },
    remark: { type: DataTypes.TEXT, allowNull: true },     // nota ringkas di header
    source: { type: DataTypes.STRING, allowNull: true },   // optional jika nak simpan di deal
  }, { 
    tableName: 'st_opportunities',
    paranoid: true,
    indexes: [
      { fields: ['teamId'] },
      { fields: ['teamId', 'statusId'] },
      { fields: ['teamId', 'userId'] },
      { fields: ['nextFollowUpAt'] },
      { fields: ['lastActivityAt'] },
    ]
  });

  Opportunities.associate = (models) => {
    Opportunities.belongsTo(models.OpportunityStatuses, { foreignKey: 'statusId' });
    Opportunities.belongsTo(models.Contacts, { foreignKey: 'contactId' });
    Opportunities.belongsTo(models.Users, { as: 'Owner', foreignKey: 'userId' });
    Opportunities.belongsTo(models.Teams, { foreignKey: 'teamId' });
    Opportunities.hasMany(models.Activities, { foreignKey: 'opportunityId', onDelete: 'CASCADE' });
    Opportunities.hasMany(models.LeadHistory, { foreignKey: 'opportunityId', onDelete: 'CASCADE' });
    Opportunities.belongsToMany(models.Products, { through: models.OpportunityProducts, foreignKey: 'opportunityId' });

    // NEW ASSOCS
    Opportunities.hasMany(models.Tasks, { foreignKey: 'opportunityId', onDelete: 'CASCADE' });
    Opportunities.hasMany(models.FollowUpAttempts, { foreignKey: 'opportunityId', onDelete: 'CASCADE' });
  };

  return Opportunities;
};
