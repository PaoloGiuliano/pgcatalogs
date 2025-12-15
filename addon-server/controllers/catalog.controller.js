const catalogsRepo = require("../db/catalogs.repo");
const catalogService = require("../services/catalog.service");

// --------------------
// LIST CATALOGS
// GET /catalogs
// --------------------
exports.list = (req, res) => {
  const catalogs = catalogsRepo.findByUser(req.user.id);

  res.render("pages/view-catalog", {
    catalogs,
  });
};

// --------------------
// CREATE FORM
// GET /catalogs/new
// --------------------
exports.newForm = (req, res) => {
  res.render("pages/create-catalog");
};

// --------------------
// CREATE CATALOG
// POST /catalogs/new
// --------------------
exports.create = async (req, res) => {
  try {
    await catalogService.createCatalog(req.user, req.body);
    res.redirect("/catalogs");
  } catch (err) {
    res.status(400).send(err.message);
  }
};

// --------------------
// EDIT FORM
// GET /catalogs/:id/edit
// --------------------
exports.editForm = (req, res) => {
  const catalogId = req.params.id;

  const catalog = catalogsRepo.findById(catalogId, req.user.id);
  if (!catalog) {
    return res.status(404).send("Catalog not found");
  }

  const config = JSON.parse(catalog.config_json);

  const genreList = [
    "action",
    "adventure",
    "animation",
    "comedy",
    "crime",
    "documentary",
    "drama",
    "family",
    "fantasy",
    "history",
    "horror",
    "music",
    "mystery",
    "romance",
    "science fiction",
    "thriller",
    "tv movie",
    "war",
    "western",
  ];

  const languages = [
    "en-US",
    "en-GB",
    "fr-FR",
    "es-ES",
    "de-DE",
    "it-IT",
    "ja-JP",
    "ko-KR",
    "zh-CN",
  ];

  const sortOrders = [
    "original_title.asc",
    "original_title.desc",
    "popularity.asc",
    "popularity.desc",
    "revenue.asc",
    "revenue.desc",
    "primary_release_date.asc",
    "primary_release_date.desc",
    "title.asc",
    "title.desc",
  ];

  res.render("pages/edit-catalog", {
    catalog,
    config,
    genreList,
    languages,
    sortOrders,
  });
};

// --------------------
// UPDATE CATALOG
// POST /catalogs/:id/edit
// --------------------
exports.update = async (req, res) => {
  const catalogId = req.params.id;

  const existing = catalogsRepo.findById(catalogId, req.user.id);
  if (!existing) {
    return res.status(404).send("Catalog not found");
  }

  try {
    await catalogService.updateCatalog(req.user, catalogId, req.body);
    res.redirect("/catalogs");
  } catch (err) {
    res.status(400).send(err.message);
  }
};

// --------------------
// DELETE CATALOG
// GET /catalogs/:id/delete
// --------------------
exports.remove = async (req, res) => {
  const catalogId = req.params.id;

  const catalog = catalogsRepo.findById(catalogId, req.user.id);
  if (!catalog) {
    return res.status(404).send("Catalog not found");
  }

  try {
    await catalogService.deleteCatalog(req.user, catalog);
    res.redirect("/catalogs");
  } catch (err) {
    res.status(500).send("Failed to delete catalog");
  }
};
