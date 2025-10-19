// salestrack-service/models/OpportunityProducts.js
module.exports = (sequelize, DataTypes) => {
    const OpportunityProducts = sequelize.define('OpportunityProducts', {
      opportunityId: { type: DataTypes.INTEGER, primaryKey: true, references: { model: 'st_opportunities', key: 'id' } },
      productId: { type: DataTypes.INTEGER, primaryKey: true, references: { model: 'st_products', key: 'id' } },
      quantity: { type: DataTypes.INTEGER, defaultValue: 1 },
      priceAtTimeOfDeal: { type: DataTypes.INTEGER }, 
    }, { 
      tableName: 'st_opportunity_products',
      timestamps: false 
    });
  
    return OpportunityProducts;
  };