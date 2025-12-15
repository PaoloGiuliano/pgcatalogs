const router = require("express").Router();
const controller = require("../controllers/stremio.controller");

router.get("/user/:uuid/manifest.json", controller.manifest);
router.get("/user/:uuid/catalog/:type/:id.json", controller.catalog);
router.get("/user/:uuid/meta/:type/:id.json", controller.meta);

module.exports = router;
