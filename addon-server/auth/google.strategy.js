const GoogleStrategy = require("passport-google-oauth20").Strategy;
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const db = require("../db"); // adjust if you move db/index.js later

const GENERATED_DIR = path.join(__dirname, "..", "generated");

module.exports = new GoogleStrategy(
  {
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "https://pgcatalogs.duckdns.org/auth/google/callback",
  },
  (accessToken, refreshToken, profile, done) => {
    try {
      const googleId = profile.id;
      const name = profile.displayName;
      const email = profile.emails?.[0]?.value;

      let user = db
        .prepare("SELECT * FROM users WHERE google_id = ?")
        .get(googleId);

      if (!user) {
        const user_uuid = crypto.randomUUID();

        db.prepare(
          `
          INSERT INTO users (user_uuid, google_id, email, display_name)
          VALUES (?, ?, ?, ?)
        `
        ).run(user_uuid, googleId, email, name);

        user = db
          .prepare("SELECT * FROM users WHERE user_uuid = ?")
          .get(user_uuid);
      }

      if (user) {
        db.prepare(
          `
          UPDATE users SET display_name = ? WHERE id = ?
        `
        ).run(name, user.id);

        user.display_name = name;
      }

      // Ensure UUID exists (legacy safety)
      if (!user.user_uuid) {
        const newUuid = crypto.randomUUID();
        db.prepare("UPDATE users SET user_uuid = ? WHERE id = ?").run(
          newUuid,
          user.id
        );
        user.user_uuid = newUuid;
      }

      // Ensure generated directories exist
      const userBaseDir = path.join(GENERATED_DIR, user.user_uuid);
      const catalogDir = path.join(userBaseDir, "catalogs");
      fs.mkdirSync(catalogDir, { recursive: true });

      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }
);
