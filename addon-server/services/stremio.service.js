const fs = require("fs");
const usersRepo = require("../db/users.repo");
const catalogsRepo = require("../db/catalogs.repo");

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function levenshtein(a, b) {
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const m = [];
  for (let i = 0; i <= b.length; i++) m[i] = [i];
  for (let j = 0; j <= a.length; j++) m[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      m[i][j] =
        b[i - 1] === a[j - 1]
          ? m[i - 1][j - 1]
          : Math.min(m[i - 1][j - 1] + 1, m[i][j - 1] + 1, m[i - 1][j] + 1);
    }
  }
  return m[b.length][a.length];
}

exports.buildManifest = (user) => {
  const catalogs = catalogsRepo.findByUser(user.id);

  return {
    id: `pgcatalogs.${user.user_uuid}`,
    version: "1.0.0",
    name: "PG Catalogs",
    types: ["movie"],
    resources: ["catalog", "meta"],
    catalogs: catalogs.map((c) => ({
      type: "movie",
      id: `catalog_${c.id}`,
      name: c.name,
    })),
  };
};

exports.loadCatalog = (catalog) => {
  return JSON.parse(fs.readFileSync(catalog.generated_path, "utf8"));
};

exports.filterCatalog = (data, { search, genre }) => {
  let filtered = data;

  if (genre) {
    filtered = filtered.filter((i) =>
      i.genres?.some((g) => g.toLowerCase() === genre)
    );
  }

  if (search) {
    filtered = filtered.filter((item) =>
      item.name.toLowerCase().includes(search)
    );
  }

  return search || genre ? filtered : shuffle(filtered);
};
