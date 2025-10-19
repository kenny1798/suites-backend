// salestrack-service/models/FollowUpAttempts.js
module.exports = (sequelize, DataTypes) => {
    const FollowUpAttempts = sequelize.define('FollowUpAttempts', {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  
      opportunityId: { type: DataTypes.INTEGER, allowNull: false },
      byUserId: { type: DataTypes.INTEGER, allowNull: false },
      teamId: { type: DataTypes.INTEGER, allowNull: false },
  
      cause: {
        type: DataTypes.ENUM('remark_change', 'next_followup_change', 'activity'),
        allowNull: false
      },
      refActivityId: { type: DataTypes.INTEGER, allowNull: true }, // jika cause=activity
    }, {
      tableName: 'st_followup_attempts',
      timestamps: true,
      updatedAt: false,
      indexes: [
        { fields: ['teamId'] },
        { fields: ['opportunityId'] },
        { fields: ['byUserId'] },
        { fields: ['cause'] },
        { fields: ['createdAt'] },
      ]
    });
  
    FollowUpAttempts.associate = (models) => {
      FollowUpAttempts.belongsTo(models.Opportunities, { foreignKey: 'opportunityId' });
      FollowUpAttempts.belongsTo(models.Users, { as: 'Actor', foreignKey: 'byUserId' });
      FollowUpAttempts.belongsTo(models.Teams, { foreignKey: 'teamId' });
      FollowUpAttempts.belongsTo(models.Activities, { foreignKey: 'refActivityId' });
    };
  
    return FollowUpAttempts;
  };
  