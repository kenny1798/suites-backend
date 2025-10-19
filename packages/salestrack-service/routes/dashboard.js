// salestrack-service/routes/dashboard.js

const router = require('express').Router();
const dashboardController = require('../controllers/dashboard.controller');
const { validateToken } = require('../middlewares/validateToken');

// Lindungi route ni, hanya pengguna login boleh akses
router.get('/', validateToken, dashboardController.getSummary);

module.exports = router;