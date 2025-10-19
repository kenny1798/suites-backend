// salestrack-service/models/TeamJoinRequests.js
module.exports = (sequelize, DataTypes) => {
    const TeamJoinRequests = sequelize.define('TeamJoinRequests', {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  
      teamId: { type: DataTypes.INTEGER, allowNull: false },
      inviterId: { type: DataTypes.INTEGER, allowNull: false }, // pemilik link
      requesterId: { type: DataTypes.INTEGER, allowNull: false }, // user yg request (waktu POST)
      requestedRole: {
        type: DataTypes.ENUM('ADMIN', 'MANAGER', 'SALES_REP'),
        allowNull: false,
      },
  
      status: {
        type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'),
        defaultValue: 'PENDING',
      },
      approvedBy: { type: DataTypes.INTEGER, allowNull: true },
  
    }, {
      tableName: 'st_team_join_requests',
      indexes: [
        { fields: ['teamId', 'status'] },
        { fields: ['teamId', 'inviterId'] },
        { fields: ['requesterId', 'teamId'] },
      ],
    });
  
    TeamJoinRequests.associate = (models) => {
      TeamJoinRequests.belongsTo(models.Teams, { foreignKey: 'teamId' });
      TeamJoinRequests.belongsTo(models.Users, { as: 'Inviter', foreignKey: 'inviterId' });
      TeamJoinRequests.belongsTo(models.Users, { as: 'Requester', foreignKey: 'requesterId' });
      TeamJoinRequests.belongsTo(models.Users, { as: 'Approver', foreignKey: 'approvedBy' });
    };
  
    return TeamJoinRequests;
  };
  