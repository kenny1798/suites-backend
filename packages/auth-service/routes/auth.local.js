const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Users } = require('@suites/database-models');
const { validateToken } = require('../middlewares/AuthMiddleware');

router.post('/register', async (req, res) => {
  const { email, password, name } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'EMAIL_PASSWORD_REQUIRED' });

  const exists = await Users.findOne({ where: { email } });
  if (exists) return res.status(409).json({ error: 'EMAIL_TAKEN' });

  const hash = await bcrypt.hash(password, 10);
  const user = await Users.create({
    email, name: name || email.split('@')[0], password: hash, isValidated: true,
  });

  const token = jwt.sign({ id: user.id, uuid: user.uuid, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'EMAIL_PASSWORD_REQUIRED' });

  const user = await Users.findOne({ where: { email } });
  if (!user || !user.password) return res.status(401).json({ error: 'INVALID_CREDENTIALS' });

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).json({ error: 'INVALID_CREDENTIALS' });

  const token = jwt.sign({ id: user.id, uuid: user.uuid, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, email: user.email, name: user.name, isValidated: user.isValidated} });
});

router.get('/me', validateToken, (req, res) => res.json(req.user));

module.exports = router;
