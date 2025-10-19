// salestrack-service/models/TeamMembers.js
module.exports = (sequelize, DataTypes) => {
  const TeamMembers = sequelize.define('TeamMembers', {
    // Pilihan: Tambah 'id' untuk primary key yang standard
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    
    role: {
      type: DataTypes.ENUM('OWNER', 'ADMIN', 'MANAGER', 'SALES_REP'),
      allowNull: false,
    },

    // <<< PENAMBAHBAIKAN DI SINI
    userId: { type: DataTypes.INTEGER, allowNull: false },
    teamId: { type: DataTypes.INTEGER, allowNull: false },
    // >>> AKHIR PENAMBAHBAIKAN

  }, { 
    tableName: 'st_team_members',
    indexes: [{ unique: true, fields: ['userId', 'teamId'] }] 
  });

  TeamMembers.associate = (models) => {
    TeamMembers.belongsTo(models.Users, { foreignKey: 'userId' });
    TeamMembers.belongsTo(models.Teams, { foreignKey: 'teamId' });
    TeamMembers.belongsTo(models.Users, { as: 'Manager', foreignKey: 'managerId' });
  };

  return TeamMembers;
};