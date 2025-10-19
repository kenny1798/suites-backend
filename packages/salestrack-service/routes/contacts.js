// salestrack-service/routes/contacts.js

const router = require('express').Router();
const contactsController = require('../controllers/contacts.controller');
const { validateToken } = require('../middlewares/validateToken');

// Lindungi semua route di bawah ini
router.use(validateToken);

// POST /api/salestrack/contacts
router.post('/', contactsController.createContact);

// GET /api/salestrack/contacts?teamId=1
router.get('/', contactsController.getContacts);

router.put('/:id', contactsController.updateContact);

module.exports = router;