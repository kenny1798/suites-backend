// models/ContactTags.js
module.exports = (sequelize, DataTypes) => {
    const ContactTags = sequelize.define('ContactTags', {
      contactId: { type: DataTypes.INTEGER, primaryKey: true, references: { model: 'st_contacts', key: 'id' } },
      tagId: { type: DataTypes.INTEGER, primaryKey: true, references: { model: 'st_tags', key: 'id' } },
    }, { 
      tableName: 'st_contact_tags',
      timestamps: false
    });
  
    return ContactTags;
  };