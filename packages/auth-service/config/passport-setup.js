const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { Users } = require('@suites/database-models');
require('dotenv').config();

passport.serializeUser((user, done) => {
    // Passport session will now store the user's integer id.
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        // Find user by their primary key (id).
        const user = await Users.findByPk(id);
        done(null, user);
    } catch (err) {
        done(err, null);
    }
});

passport.use(
    new GoogleStrategy({
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            // Make sure this callbackURL matches what you registered in Google Cloud Console
            callbackURL: '/api/auth/google/callback', 
            proxy: true // Important if your app is behind a proxy (like Nginx or Heroku)
        },
        async (accessToken, refreshToken, profile, done) => {
            try {
                const userEmail = profile.emails[0].value;
                
                // Find user by their unique email
                let user = await Users.findOne({ where: { email: userEmail } });

                if (user) {
                    // If user exists but googleId is not linked, link it.
                    if (!user.googleId) {
                        user.googleId = profile.id;
                        await user.save();
                    }
                    // Pass the existing user to the callback
                    return done(null, user);
                } else {
                    // If user does not exist, create a new one.
                    const newUser = await Users.create({
                        googleId: profile.id,
                        name: profile.displayName,
                        email: userEmail,
                        // Use the correct field name 'isValidated' from our model
                        isValidated: true, // Automatically validate Google users
                    });
                    // Pass the new user to the callback
                    return done(null, newUser);
                }
            } catch (err) {
                // Handle potential errors
                return done(err, false);
            }
        }
    )
);