const usersRepo = require("../db/users.repo");
const catalogsRepo = require("../db/catalogs.repo");
const stremioService = require("../services/stremio.service");

exports.manifest = (req, res) => {
  const user = usersRepo.findByUuid(req.params.uuid);
  if (!user) return res.status(404).json({});

  res.json(stremioService.buildManifest(user));
};

exports.catalog = (req, res) => {
  const user = usersRepo.findByUuid(req.params.uuid);
  if (!user) return res.json({ metas: [] });

  const catalogId = req.params.id.replace("catalog_", "");
  const catalog = catalogsRepo.findById(catalogId, user.id);
  if (!catalog) return res.json({ metas: [] });

  const data = stremioService.loadCatalog(catalog);
  const filtered = stremioService.filterCatalog(data, req.query);

  res.json({ metas: filtered });
};

exports.meta = (req, res) => {
  const user = usersRepo.findByUuid(req.params.uuid);
  if (!user) return res.json({ meta: null });

  const catalogs = catalogsRepo.findByUser(user.id);
  for (const c of catalogs) {
    const data = stremioService.loadCatalog(c);
    const found = data.find((i) => i.id === req.params.id);
    if (found) return res.json({ meta: found });
  }

  res.json({ meta: null });
};
