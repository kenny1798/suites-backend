// auth.google.js (server)
const router = require('express').Router();
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const jwt = require('jsonwebtoken');
const { Users } = require('@suites/database-models');

/* ---------- helpers ---------- */
// only allow same-origin path redirects
function sanitizeRedirect(raw) {
  if (!raw) return '/';
  try {
    // absolute -> strip origin
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      const u = new URL(raw);
      raw = `${u.pathname}${u.search}${u.hash}`;
    }
  } catch (_) { return '/'; }
  return raw.startsWith('/') ? raw : '/';
}
const packState = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const unpackState = (s) => {
  try { return JSON.parse(Buffer.from(String(s || ''), 'base64url').toString()); }
  catch { return {}; }
};

passport.use(new GoogleStrategy(
  {
    clientID:     process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL:  process.env.GOOGLE_CALLBACK_URL,
  },
  async (_access, _refresh, profile, done) => {
    try {
      const email = profile.emails?.[0]?.value;
      const googleId = profile.id;
      const name = profile.displayName || email;

      let user = await Users.findOne({ where: { googleId } });
      if (!user && email) {
        user = await Users.findOne({ where: { email } });
        if (user && !user.googleId) await user.update({ googleId });
        if (!user) user = await Users.create({ email, name, googleId, isValidated: true });
      }
      if (!user) return done(null, false);

      const token = jwt.sign(
        { id: user.id, uuid: user.uuid, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );
      return done(null, { token });
    } catch (e) {
      return done(e);
    }
  }
));

router.use(passport.initialize());

/**
 * STEP 1: start OAuth, carry `redirect` in state
 * GET /auth/google?redirect=/salestrack/invite/17/0417345f/SALES_REP/1?managerId=3
 */
router.get('/google', (req, res, next) => {
  const redirect = sanitizeRedirect(req.query.redirect);
  const state = packState({ redirect });
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    state,               // ← carry it through Google
    session: false,
  })(req, res, next);
});

/**
 * STEP 2: callback, echo token + redirect back to client
 */
router.get(
  '/google/callback',
  passport.authenticate('google', {
    session: false,
    failureRedirect: process.env.CLIENT,
  }),
  (req, res) => {
    const token = req.user.token;
    // pull back redirect from state
    const { redirect } = unpackState(req.query.state);
    const safeRedirect = sanitizeRedirect(redirect);

    const url = new URL(process.env.CLIENT);
    url.pathname = '/auth-success';
    url.searchParams.set('token', token);
    if (safeRedirect) url.searchParams.set('redirect', safeRedirect);
    res.redirect(url.toString());
  }
);

module.exports = router;
