const router = require('express').Router();
const { validateToken } = require('../middlewares/AuthMiddleware');

router.get('/profile', validateToken, (req, res) => res.json(req.user));

module.exports = router;
