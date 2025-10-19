// salestrack-service/models/Products.js
module.exports = (sequelize, DataTypes) => {
  const Products = sequelize.define('Products', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT },
    priceCents: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    category: { type: DataTypes.STRING },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },

    // <<< PENAMBAHBAIKAN DI SINI
    teamId: { type: DataTypes.INTEGER, allowNull: false },
    // >>> AKHIR PENAMBAHBAIKAN

  }, { tableName: 'st_products' });
 
  Products.associate = (models) => {
    Products.belongsTo(models.Teams, { foreignKey: 'teamId' });
    Products.belongsToMany(models.Opportunities, { through: 'st_opportunity_products', foreignKey: 'productId' });
  };
 
  return Products;
};