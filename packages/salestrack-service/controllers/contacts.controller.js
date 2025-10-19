// salestrack-service/controllers/contacts.controller.js

const { Contacts, TeamMembers } = require('@suites/database-models');

/**
 * Cipta satu contact baru.
 */
exports.createContact = async (req, res) => {
  // Data contact dari body request
  const { name, email, phone, phonecc, source, teamId } = req.body;
  // userId dari pengguna yang sedang login (dari middleware validateToken)
  const userId = req.user.id;

  try {
    // Semak jika pengguna adalah ahli pasukan sebelum benarkan dia tambah contact
    const membership = await TeamMembers.findOne({ where: { userId, teamId } });
    if (!membership) {
      return res.status(403).json({ error: 'Forbidden: You are not a member of this team.' });
    }

    if(!name || !phone || !phonecc) {
      return res.status(400).json({ error: 'name, phone and phone country code are required.' });
    }

    const newContact = await Contacts.create({
      name, email, phone, phonecc, source,
      teamId,
      userId,
    });

    res.status(201).json(newContact);
  } catch (error) {
    // Handle ralat jika emel dah wujud (kerana 'unique: true' dalam model)
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ error: 'A contact with this phone number already exists.' });
    }
    if(error.errors[0].message == 'Validation isEmail on email failed' && error.errors[0].path == 'email') {
      return res.status(409).json({ error: 'Please enter a valid email address.' });
    };
    res.status(500).json({ error: 'Failed to create contact.', details: error.message });
  }
};

/**
 * Dapatkan senarai contact berdasarkan team dan role pengguna.
 */
exports.getContacts = async (req, res) => {
  try {
    const userId = req.user.id;
    const { teamId } = req.query;

    if (!teamId) {
      return res.status(400).json({ error: 'teamId query parameter is required.' });
    }

    // Pastikan user memang ahli team ini
    const membership = await TeamMembers.findOne({ where: { userId, teamId } });
    if (!membership) {
      return res.status(403).json({ error: 'Forbidden: You are not a member of this team.' });
    }

    // Tapis ikut team + owner (userId) SAHAJA — tak kira role apa
    const contacts = await Contacts.findAll({
      where: { teamId, userId },
      order: [['name', 'ASC']],
    });

    return res.json(contacts);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch contacts.', details: error.message });
  }
};

exports.updateContact = async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  const { teamId, name, email, phone, phonecc, source } = req.body;

  if (!teamId) return res.status(400).json({ error: 'teamId is required.' });

  try {
    const membership = await TeamMembers.findOne({ where: { userId, teamId } });
    if (!membership) return res.status(403).json({ error: 'Forbidden.' });

    const row = await Contacts.findOne({ where: { id, teamId } });
    if (!row) return res.status(404).json({ error: 'Contact not found.' });

    if (name != null) row.name = name;
    if (email !== undefined) row.email = email || null;
    if (phone !== undefined) row.phone = phone || null; // unique constraint on (teamId,userId,phone) will apply
    if (phonecc !== undefined) row.phonecc = phonecc || null;
    if (source !== undefined) row.source = source || null;

    await row.save();
    res.json(row);
  } catch (e) {
    if (e.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ error: 'A contact with this phone number already exists.' });
    }
    if (e?.errors?.[0]?.message === 'Validation isEmail on email failed') {
      return res.status(409).json({ error: 'Please enter a valid email address.' });
    }
    res.status(500).json({ error: 'Failed to update contact.', details: e.message });
  }
};
