// packages/database-models/models/Tool.js

module.exports = (sequelize, DataTypes) => {
  const Tool = sequelize.define('Tool', {
    slug: { type: DataTypes.STRING, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    shortName: { type: DataTypes.STRING, allowNull: true },
    category: { type: DataTypes.STRING, allowNull: true },
    basePath: { type: DataTypes.STRING, allowNull: true },
    icon: { type: DataTypes.STRING, allowNull: true },
    description: { type: DataTypes.TEXT, allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    sort: { type: DataTypes.INTEGER, defaultValue: 0 },
  }, {
    tableName: 'tools',
    timestamps: false,
  });

  Tool.associate = (models) => {
    // Pastikan baris 'as: 'plans'' wujud di sini
    Tool.hasMany(models.Plan, { 
      foreignKey: 'toolId', 
      sourceKey: 'slug',
      as: 'plans' // <--- BAHAGIAN PALING PENTING
    });
    
    Tool.hasMany(models.ToolSubscription, { 
      foreignKey: 'toolId', 
      sourceKey: 'slug',
      as: 'subscriptions'
    });
  };

  return Tool;
};