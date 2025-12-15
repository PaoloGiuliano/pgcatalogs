const router = require("express").Router();
const passport = require("passport");

router.get("/login", (req, res) => {
  if (req.user) return res.redirect("/dashboard");
  res.render("pages/login");
});

router.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

router.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/login" }),
  (req, res) => res.redirect("/dashboard")
);

router.get("/logout", (req, res) => {
  req.logout(() => {
    req.session.destroy(() => res.redirect("/login"));
  });
});

module.exports = router;
