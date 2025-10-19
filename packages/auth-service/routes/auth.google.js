const router = require('express').Router();
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const jwt = require('jsonwebtoken');
const { Users } = require('@suites/database-models');

passport.use(new GoogleStrategy(
  {
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL,
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

      const token = jwt.sign({ id: user.id, uuid: user.uuid, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
      return done(null, { token });
    } catch (e) {
      return done(e);
    }
  }
));

router.use(passport.initialize());

router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: process.env.CLIENT }),
  (req, res) => {
    const token = req.user.token;
    const url = new URL(process.env.CLIENT);
    url.pathname = '/auth-success';
    url.searchParams.set('token', token);
    res.redirect(url.toString());
  }
);

module.exports = router;
