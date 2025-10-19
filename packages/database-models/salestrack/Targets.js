// salestrack-service/models/Targets.js
module.exports = (sequelize, DataTypes) => {
  const Targets = sequelize.define('Targets', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    month: { type: DataTypes.INTEGER, allowNull: false }, // 1-12
    year: { type: DataTypes.INTEGER, allowNull: false },
    targetValue: { type: DataTypes.INTEGER, defaultValue: 0 }, // Dalam sen
    targetUnits: { type: DataTypes.INTEGER, defaultValue: 0 },

    // <<< PENAMBAHBAIKAN DI SINI
    userId: { type: DataTypes.INTEGER, allowNull: false },
    teamId: { type: DataTypes.INTEGER, allowNull: false },
    // >>> AKHIR PENAMBAHBAIKAN

  }, { 
    tableName: 'st_targets',
    indexes: [{ unique: true, fields: ['userId', 'teamId', 'month', 'year'] }] 
  });

  Targets.associate = (models) => {
    Targets.belongsTo(models.Users, { foreignKey: 'userId' });
    Targets.belongsTo(models.Teams, { foreignKey: 'teamId' });
  };

  return Targets;
};