const { addonBuilder } = require("stremio-addon-sdk");
const fs = require("fs");
const path = require("path");

// -------------------------------------------
// Load all catalog JSON files dynamically
// -------------------------------------------

const catalogDir = path.join(__dirname, "../../catalog-builder/data/catalogs");

function loadCatalogs() {
  const files = fs.readdirSync(catalogDir);
  const catalogs = {};

  for (const file of files) {
    if (file.endsWith(".json")) {
      const id = path.basename(file, ".json"); // filename without extension
      const json = JSON.parse(
        fs.readFileSync(path.join(catalogDir, file), "utf8")
      );
      catalogs[id] = json;
    }
  }

  return catalogs;
}

const catalogs = loadCatalogs();

// -------------------------------------------
// Build dynamic catalog entries for manifest
// -------------------------------------------

const catalogEntries = Object.keys(catalogs).map((id) => ({
  type: "movie",
  id: id,
  name: id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
}));

// -------------------------------------------
// Manifest now uses dynamic catalogs
// -------------------------------------------

const manifest = {
  id: "community.pgcats",
  version: "0.0.1",
  name: "pgcats",
  description: "free free free",
  types: ["movie"],
  catalogs: catalogEntries,
  resources: ["catalog", "meta"],
 };

const builder = new addonBuilder(manifest);

// -------------------------------------------
// Shuffle helper
// -------------------------------------------

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// -------------------------------------------
// Catalog handler (fully dynamic)
// -------------------------------------------
builder.defineCatalogHandler(async ({ type, id }) => {
  if (type !== "movie") return { metas: [] };

  const list = catalogs[id];
  if (!list) return { metas: [] };

  const shuffled = shuffle(list);

  return {
    metas: shuffled.map((item) => ({
      id: item.id,
      type: item.type,
      name: item.name,
      poster: item.poster,
      description: item.description,
      genres: item.genres,
      year: item.year,
      // DO NOT put cast/director here
    }))
  };
});

builder.defineMetaHandler(async ({ type, id }) => {
  const item = findItemById(id); // however you retrieve your movie

  if (!item) return { meta: null };

  return {
    meta: {
      id: item.id,
      type: item.type,
      name: item.name,
      poster: item.poster,
      description: item.description,
      genres: item.genres,
      year: item.year,

      // NEW REQUIRED FORMAT FOR CAST/DIRECTOR:
      links: [
        {
          name: "Director",
          category: "director",
          ids: item.director   // must be an array of names
        },
        {
          name: "Cast",
          category: "cast",
          ids: item.cast       // must be an array of names
        }
      ]
    }
  };
});
module.exports = builder.getInterface();
