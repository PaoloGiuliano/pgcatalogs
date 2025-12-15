const router = require("express").Router();
const ensureLoggedIn = require("../auth/ensureLoggedIn");
const controller = require("../controllers/catalog.controller");

// List catalogs
router.get("/", ensureLoggedIn, controller.list);

// Create
router.get("/new", ensureLoggedIn, controller.newForm);
router.post("/new", ensureLoggedIn, controller.create);

// Edit
router.get("/:id/edit", ensureLoggedIn, controller.editForm);
router.post("/:id/edit", ensureLoggedIn, controller.update);

// Delete
router.get("/:id/delete", ensureLoggedIn, controller.remove);

module.exports = router;
