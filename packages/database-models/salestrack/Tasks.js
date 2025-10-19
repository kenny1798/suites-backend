// salestrack-service/models/Tasks.js
module.exports = (sequelize, DataTypes) => {
    const Tasks = sequelize.define('Tasks', {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  
      opportunityId: { type: DataTypes.INTEGER, allowNull: false },
      assigneeId: { type: DataTypes.INTEGER, allowNull: false }, // user yang perlu buat
  
      type: {
        type: DataTypes.ENUM('CALL', 'WHATSAPP', 'EMAIL', 'MEETING', 'FOLLOWUP'),
        allowNull: false,
        defaultValue: 'FOLLOWUP'
      },
      note: { type: DataTypes.TEXT, allowNull: true },
  
      dueAt: { type: DataTypes.DATE, allowNull: false },
      status: {
        type: DataTypes.ENUM('OPEN', 'DONE', 'SNOOZED', 'CANCELLED'),
        allowNull: false,
        defaultValue: 'OPEN'
      },
      completedAt: { type: DataTypes.DATE, allowNull: true },
      snoozeUntil: { type: DataTypes.DATE, allowNull: true },
      createdBy: { type: DataTypes.INTEGER, allowNull: false }, // siapa create task
      teamId: { type: DataTypes.INTEGER, allowNull: false },
    }, {
      tableName: 'st_tasks',
      indexes: [
        { fields: ['teamId'] },
        { fields: ['assigneeId', 'status', 'dueAt'] },
        { fields: ['opportunityId'] },
      ]
    });
  
    Tasks.associate = (models) => {
      Tasks.belongsTo(models.Opportunities, { foreignKey: 'opportunityId' });
      Tasks.belongsTo(models.Users, { as: 'Assignee', foreignKey: 'assigneeId' });
      Tasks.belongsTo(models.Users, { as: 'Creator', foreignKey: 'createdBy' });
      Tasks.belongsTo(models.Teams, { foreignKey: 'teamId' });
    };
  
    return Tasks;
  };
  