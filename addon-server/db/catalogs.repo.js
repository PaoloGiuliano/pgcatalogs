const db = require("./index");

// List all catalogs for a user
exports.findByUser = (userId) => {
  return db.prepare("SELECT * FROM catalogs WHERE user_id = ?").all(userId);
};

// Find one catalog by id that belongs to a user
exports.findById = (catalogId, userId) => {
  return db
    .prepare("SELECT * FROM catalogs WHERE id = ? AND user_id = ?")
    .get(catalogId, userId);
};

// Insert catalog row
exports.insert = (userId, name, configJson) => {
  return db
    .prepare(
      "INSERT INTO catalogs (user_id, name, config_json) VALUES (?, ?, ?)"
    )
    .run(userId, name, configJson);
};

// After create: store generated path + timestamp
exports.updateGeneratedPathAndTimestamp = (catalogId, generatedPath) => {
  return db
    .prepare(
      `UPDATE catalogs
       SET generated_path = ?, last_generated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
    .run(generatedPath, catalogId);
};

// After update: store name + config + timestamp (matches your original update route)
exports.updateConfigAndName = (catalogId, userId, name, configJson) => {
  return db
    .prepare(
      `UPDATE catalogs
       SET name = ?, config_json = ?, last_generated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`
    )
    .run(name, configJson, catalogId, userId);
};

// After update rebuild: store generated path only
exports.updateGeneratedPathOnly = (catalogId, generatedPath) => {
  return db
    .prepare("UPDATE catalogs SET generated_path = ? WHERE id = ?")
    .run(generatedPath, catalogId);
};

// Delete catalog row (scoped to user)
exports.deleteById = (catalogId, userId) => {
  return db
    .prepare("DELETE FROM catalogs WHERE id = ? AND user_id = ?")
    .run(catalogId, userId);
};
