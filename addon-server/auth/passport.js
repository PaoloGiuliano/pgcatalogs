const passport = require("passport");
const db = require("../db");
const googleStrategy = require("./google.strategy");

// Serialize user ID into session
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser((id, done) => {
  try {
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
    done(null, user || false);
  } catch (err) {
    done(err);
  }
});

// Register strategies
passport.use(googleStrategy);

module.exports = passport;
