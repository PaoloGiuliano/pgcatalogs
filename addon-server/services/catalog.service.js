const fs = require("fs");
const path = require("path");

const catalogsRepo = require("../db/catalogs.repo");
const buildCatalog = require("../../catalog-builder/index.js");

const GENERATED_DIR = path.join(__dirname, "..", "generated");

// ----------------------------
// shared helpers
// ----------------------------
function normalizeGenres(body) {
  if (!body.genres) return [];
  if (Array.isArray(body.genres))
    return body.genres.map((g) => String(g).trim().toLowerCase());
  return [String(body.genres).trim().toLowerCase()];
}

function validateCreateInput(body) {
  const {
    name,
    start_year,
    end_year,
    pages,
    language,
    sort_order,
    min_critic_score,
  } = body;

  if (!name || !/^[A-Za-z0-9_-]+$/.test(name)) {
    throw new Error(
      "Invalid name. Use letters, numbers, underscores or dashes. No spaces."
    );
  }

  const sy = Number(start_year);
  const ey = Number(end_year);
  const pg = Number(pages);
  const mcrit =
    min_critic_score !== undefined && min_critic_score !== ""
      ? Number(min_critic_score)
      : null;

  if (Number.isNaN(sy) || sy < 1900 || sy > 2100)
    throw new Error("Invalid start year.");
  if (Number.isNaN(ey) || ey < 1900 || ey > 2100)
    throw new Error("Invalid end year.");
  if (ey < sy) throw new Error("End year cannot be less than start year.");
  if (Number.isNaN(pg) || pg < 1 || pg > 50)
    throw new Error("Invalid pages count.");
  if (!language) throw new Error("Language required.");
  if (!sort_order) throw new Error("Sort order required.");

  if (mcrit !== null && (Number.isNaN(mcrit) || mcrit < 0 || mcrit > 100)) {
    throw new Error("Invalid critic score (0–100).");
  }

  return { sy, ey, pg, mcrit };
}

function buildConfigFromBody(body, { validateName = false } = {}) {
  if (validateName) validateCreateInput(body);

  const sy = Number(body.start_year);
  const ey = Number(body.end_year);
  const pg = Number(body.pages);

  // keep behavior close to your original update route
  const mcritRaw = body.min_critic_score;
  const mcrit =
    mcritRaw !== undefined && mcritRaw !== "" ? Number(mcritRaw) : null;

  return {
    start_year: sy,
    end_year: ey,
    pages: pg,
    language: body.language,
    sort_order: body.sort_order,
    genres: normalizeGenres(body),
    min_critic_score: mcrit,
  };
}

// ----------------------------
// CREATE
// ----------------------------
exports.createCatalog = async (user, body) => {
  // strict validation like your original POST /catalogs/new
  const { sy, ey, pg, mcrit } = validateCreateInput(body);

  const configObj = {
    start_year: sy,
    end_year: ey,
    pages: pg,
    language: body.language,
    sort_order: body.sort_order,
    genres: normalizeGenres(body),
    min_critic_score: mcrit,
  };

  // 1) insert row
  const insertRes = catalogsRepo.insert(
    user.id,
    body.name,
    JSON.stringify(configObj)
  );
  const catalogId = insertRes.lastInsertRowid;

  // 2) build catalog
  let outputJson;
  try {
    outputJson = await buildCatalog(configObj);
  } catch (err) {
    throw new Error("Error generating catalog: " + err.message);
  }

  // 3) write file
  const userDir = path.join(GENERATED_DIR, user.user_uuid, "catalogs");
  fs.mkdirSync(userDir, { recursive: true });

  const filePath = path.join(userDir, `catalog_${catalogId}.json`);
  try {
    fs.writeFileSync(filePath, JSON.stringify(outputJson, null, 2));
  } catch (err) {
    throw new Error("Error writing catalog file: " + err.message);
  }

  // 4) update DB with path + timestamp
  catalogsRepo.updateGeneratedPathAndTimestamp(catalogId, filePath);

  return { catalogId, filePath };
};

// ----------------------------
// UPDATE
// ----------------------------
exports.updateCatalog = async (user, catalogId, body) => {
  const existing = catalogsRepo.findById(catalogId, user.id);
  if (!existing) throw new Error("Catalog not found.");

  // Keep behavior close to original: it did parseInt without the stricter create validation.
  const configObj = buildConfigFromBody(body);

  // Update DB row (name + config + timestamp)
  catalogsRepo.updateConfigAndName(
    catalogId,
    user.id,
    body.name,
    JSON.stringify(configObj)
  );

  // Ensure directory exists
  const userDir = path.join(GENERATED_DIR, user.user_uuid, "catalogs");
  fs.mkdirSync(userDir, { recursive: true });

  const filePath = path.join(userDir, `catalog_${catalogId}.json`);

  // Rebuild + write file
  const data = await buildCatalog(configObj);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

  // Update path
  catalogsRepo.updateGeneratedPathOnly(catalogId, filePath);

  return { filePath };
};

// ----------------------------
// DELETE
// ----------------------------
exports.deleteCatalog = async (user, catalogRow) => {
  // catalogRow should already be verified to belong to the user by controller/repo usage
  if (catalogRow.generated_path && fs.existsSync(catalogRow.generated_path)) {
    fs.unlinkSync(catalogRow.generated_path);
  }

  catalogsRepo.deleteById(catalogRow.id, user.id);
};
