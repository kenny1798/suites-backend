// salestrack-service/models/TeamReporting.js
module.exports = (sequelize, DataTypes) => {
    const TeamReporting = sequelize.define('TeamReporting', {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      teamId: { type: DataTypes.INTEGER, allowNull: false },
      managerUserId: { type: DataTypes.INTEGER, allowNull: false },
      repUserId: { type: DataTypes.INTEGER, allowNull: false },
    }, {
      tableName: 'st_team_reporting',
      indexes: [{ unique: true, fields: ['teamId', 'managerUserId', 'repUserId'] }],
    });
  
    TeamReporting.associate = (models) => {
      TeamReporting.belongsTo(models.Teams, { foreignKey: 'teamId' });
      TeamReporting.belongsTo(models.Users, { as: 'Manager', foreignKey: 'managerUserId' });
      TeamReporting.belongsTo(models.Users, { as: 'Rep', foreignKey: 'repUserId' });
    };
  
    return TeamReporting;
  };
  