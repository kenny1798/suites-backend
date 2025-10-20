// salestrack-service/models/LeadHistory.js
module.exports = (sequelize, DataTypes) => {
  const LeadHistory = sequelize.define('LeadHistory', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    type: { type: DataTypes.STRING(32), allowNull: false },
    details: { type: DataTypes.JSON },

    // <<< PENAMBAHBAIKAN DI SINI
    opportunityId: { type: DataTypes.INTEGER, allowNull: false },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    // >>> AKHIR PENAMBAHBAIKAN

  }, { tableName: 'st_lead_history', timestamps: true, updatedAt: false });

  LeadHistory.associate = (models) => {
    LeadHistory.belongsTo(models.Opportunities, { foreignKey: 'opportunityId' });
    LeadHistory.belongsTo(models.Users, { foreignKey: 'userId' });
    LeadHistory.hasMany(models.LeadHistoryComments, { foreignKey: 'historyId', onDelete: 'CASCADE' });
  };

  return LeadHistory;
};