// middlewares/AuthMiddleware.js
const jwt = require('jsonwebtoken');
const { Users } = require('@suites/database-models');

function pickToken(req) {
  // Priority: Authorization: Bearer <token> → accessToken header → cookie → ?token
  const auth = req.headers.authorization || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const header = req.header('accessToken') || req.headers['accesstoken'] || null;
  const cookie = req.cookies?.accessToken || null;      // if you use cookie-parser
  const query  = req.query?.token || null;
  return bearer || header || cookie || query || null;
}

/**
 * Strict: user must be logged in & validated.
 * Attaches: req.user = { id, uuid, email, name, isValidated }
 */
async function validateToken(req, res, next) {
  try {
    const token = pickToken(req);
    if (!token) return res.status(401).json({ error: 'NO_TOKEN' });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const uuid = payload.uuid || payload.sub || null;

    let user = null;
    if (uuid) user = await Users.findOne({ where: { uuid } });
    if (!user && payload.id) user = await Users.findByPk(payload.id);

    if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' });
    if (!user.isValidated) return res.status(403).json({ error: 'USER_NOT_VALIDATED' });

    req.user = {
      id: user.id,
      uuid: user.uuid,
      email: user.email,
      name: user.name,
      isValidated: !!user.isValidated,
    };
    next();
  } catch (e) {
    return res.status(401).json({ error: 'INVALID_TOKEN' });
  }
}

/**
 * Optional: attach user if token exists, otherwise continue as guest.
 * Useful for endpoints that behave slightly differently for logged-in users.
 */
async function maybeAuth(req, _res, next) {
  const token = pickToken(req);
  if (!token) return next();
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const uuid = payload.uuid || payload.sub || null;
    let user = null;
    if (uuid) user = await Users.findOne({ where: { uuid } });
    if (!user && payload.id) user = await Users.findByPk(payload.id);
    if (user) {
      req.user = {
        id: user.id,
        uuid: user.uuid,
        email: user.email,
        name: user.name,
        isValidated: !!user.isValidated,
      };
    }
  } catch {
    // ignore invalid token in maybeAuth
  }
  next();
}

/**
 * Simple admin guard:
 * - If JWT has claim role === 'admin', allow
 * - Else if env ADMIN_EMAILS contains user.email, allow
 * Requires validateToken mounted before this.
 */
function requireAdmin(req, res, next) {
  try {
    if (!req.user) return res.status(401).json({ error: 'NO_USER_CONTEXT' });

    // If you issue admin claim inside your login flow, you can uncomment:
    // const token = pickToken(req);
    // const payload = jwt.verify(token, process.env.JWT_SECRET);
    // if (payload.role === 'admin') return next();

    const allowList = (process.env.ADMIN_EMAILS || '')
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);

    if (allowList.includes((req.user.email || '').toLowerCase())) {
      return next();
    }
    return res.status(403).json({ error: 'ADMIN_ONLY' });
  } catch {
    return res.status(403).json({ error: 'ADMIN_ONLY' });
  }
}

module.exports = { validateToken, maybeAuth, requireAdmin };
