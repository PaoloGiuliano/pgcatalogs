module.exports = function ensureLoggedIn(req, res, next) {
  if (!req.user) {
    return res.redirect("/login");
  }
  next();
};
