// salestrack-service/models/TeamInvitations.js
module.exports = (sequelize, DataTypes) => {
    const TeamInvitations = sequelize.define('TeamInvitations', {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      teamId: { type: DataTypes.INTEGER, allowNull: false },
      role: {
        type: DataTypes.ENUM('ADMIN', 'MANAGER', 'SALES_REP'),
        allowNull: false,
      },
      // siapa jemput
      invitedByUserId: { type: DataTypes.INTEGER, allowNull: false },
  
      // optional: assign bawah manager mana (userId manager dalam team yang sama)
      managerId: { type: DataTypes.INTEGER, allowNull: true },
  
      token: { type: DataTypes.STRING(128), allowNull: false, unique: true },
      status: {
        type: DataTypes.ENUM('PENDING', 'ACCEPTED', 'CANCELLED', 'EXPIRED'),
        defaultValue: 'PENDING',
      },
      expiresAt: { type: DataTypes.DATE, allowNull: false },
      acceptedAt: { type: DataTypes.DATE },
      acceptedByUserId: { type: DataTypes.INTEGER },
    }, {
      tableName: 'st_team_invitations',
      indexes: [
        { fields: ['teamId'] },
        { unique: true, fields: ['teamId', 'email', 'status'] }, // elak duplicate pending untuk email yg sama
      ],
    });
  
    TeamInvitations.associate = (models) => {
      TeamInvitations.belongsTo(models.Teams, { foreignKey: 'teamId' });
      TeamInvitations.belongsTo(models.Users, { as: 'Inviter', foreignKey: 'invitedByUserId' });
    };
  
    return TeamInvitations;
  };
  