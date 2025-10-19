// models/Activities.js
module.exports = (sequelize, DataTypes) => {
  const Activities = sequelize.define('Activities', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    type: { 
      type: DataTypes.ENUM('CALL', 'EMAIL', 'MEETING', 'DEMO', 'WHATSAPP'),
      allowNull: false 
    },
    status: { 
      type: DataTypes.ENUM('PLANNED', 'COMPLETED', 'CANCELLED'), 
      defaultValue: 'COMPLETED' 
    },
    outcome: { type: DataTypes.STRING },
    notes: { type: DataTypes.TEXT },
    scheduledAt: { type: DataTypes.DATE },
    completedAt: { type: DataTypes.DATE },

    // FKs (sedia ada di associate, tapi bagusnya jelas kat sini)
    opportunityId: { type: DataTypes.INTEGER, allowNull: false },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    teamId: { type: DataTypes.INTEGER, allowNull: false },
  }, { 
    tableName: 'st_activities',
    indexes: [
      { fields: ['opportunityId'] },
      { fields: ['userId'] },
      { fields: ['teamId'] },
      { fields: ['status', 'scheduledAt'] },
      { fields: ['userId', 'status', 'completedAt'] }
    ]
  });

  Activities.associate = (models) => {
    Activities.belongsTo(models.Opportunities, { foreignKey: 'opportunityId' });
    Activities.belongsTo(models.Users, { foreignKey: 'userId' });
    Activities.belongsTo(models.Teams, { foreignKey: 'teamId' });
  };

  return Activities;
};
