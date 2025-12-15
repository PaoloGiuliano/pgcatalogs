const db = require("./index");

// ----------------------
// FINDERS
// ----------------------

exports.findById = (id) => {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id);
};

exports.findByGoogleId = (googleId) => {
  return db.prepare("SELECT * FROM users WHERE google_id = ?").get(googleId);
};

exports.findByUuid = (uuid) => {
  return db.prepare("SELECT * FROM users WHERE user_uuid = ?").get(uuid);
};

// ----------------------
// CREATION
// ----------------------

exports.createFromGoogle = ({ user_uuid, google_id, email, display_name }) => {
  const stmt = db.prepare(`
    INSERT INTO users (user_uuid, google_id, email, display_name)
    VALUES (?, ?, ?, ?)
  `);

  const result = stmt.run(user_uuid, google_id, email, display_name);

  return exports.findById(result.lastInsertRowid);
};

// ----------------------
// UPDATES
// ----------------------

exports.updateDisplayName = (id, display_name) => {
  db.prepare(
    `
    UPDATE users SET display_name = ? WHERE id = ?
  `
  ).run(display_name, id);
};

exports.updateUuid = (id, user_uuid) => {
  db.prepare(
    `
    UPDATE users SET user_uuid = ? WHERE id = ?
  `
  ).run(user_uuid, id);
};
