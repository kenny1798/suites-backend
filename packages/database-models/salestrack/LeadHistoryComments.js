// salestrack-service/models/LeadHistoryComments.js
module.exports = (sequelize, DataTypes) => {
  const LeadHistoryComments = sequelize.define('LeadHistoryComments', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    content: { type: DataTypes.TEXT, allowNull: false },

    // <<< PENAMBAHBAIKAN DI SINI
    historyId: { type: DataTypes.INTEGER, allowNull: false },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    // parentId merujuk kepada komen lain, jadi ia boleh jadi NULL (untuk komen utama)
    parentId: { type: DataTypes.INTEGER, allowNull: true }, 
    // >>> AKHIR PENAMBAHBAIKAN

  }, { tableName: 'st_lead_history_comments' });

  LeadHistoryComments.associate = (models) => {
    LeadHistoryComments.belongsTo(models.LeadHistory, { foreignKey: 'historyId' });
    LeadHistoryComments.belongsTo(models.Users, { foreignKey: 'userId' });
    // Hubungan ini membolehkan satu komen membalas komen yang lain
    LeadHistoryComments.belongsTo(models.LeadHistoryComments, { as: 'Parent', foreignKey: 'parentId' });
  };

  return LeadHistoryComments;
};