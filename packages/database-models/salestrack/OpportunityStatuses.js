// salestrack-service/models/OpportunityStatuses.js
module.exports = (sequelize, DataTypes) => {
  const OpportunityStatuses = sequelize.define('OpportunityStatuses', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    order: { type: DataTypes.INTEGER, defaultValue: 0 },
    color: { type: DataTypes.STRING, allowNull: true },
    category: {
      type: DataTypes.ENUM('Prospect', 'Deal', 'Outcome', 'Ongoing'),
      allowNull: false,
      defaultValue: 'Prospect'
    },

    // NEW FLAGS
    isWon: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    isLost: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    isFollowUpStage: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

    // Optional SLA/WIP
    slaDays: { type: DataTypes.INTEGER, allowNull: true },
    wipLimit: { type: DataTypes.INTEGER, allowNull: true },

    teamId: { type: DataTypes.INTEGER, allowNull: false },
  }, { 
    tableName: 'st_opportunity_statuses',
    indexes: [
      { fields: ['teamId'] },
      { fields: ['teamId', 'order'] },
      { fields: ['isWon'] },
      { fields: ['isLost'] },
      { fields: ['isFollowUpStage'] },
    ]
  });

  OpportunityStatuses.associate = (models) => {
    OpportunityStatuses.belongsTo(models.Teams, { foreignKey: 'teamId' });
    OpportunityStatuses.hasMany(models.Opportunities, { foreignKey: 'statusId' });
  };

  return OpportunityStatuses;
};
