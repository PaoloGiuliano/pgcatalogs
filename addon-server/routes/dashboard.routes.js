const router = require("express").Router();
const ensureLoggedIn = require("../auth/ensureLoggedIn");
const controller = require("../controllers/dashboard.controller");

// ROOT
router.get("/", (req, res) => {
  if (req.user) return res.redirect("/dashboard");
  return res.redirect("/login");
});

// DASHBOARD
router.get("/dashboard", ensureLoggedIn, controller.show);

module.exports = router;
