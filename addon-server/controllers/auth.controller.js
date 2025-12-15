exports.loginPage = (req, res) => {
  if (req.user) {
    return res.redirect("/dashboard");
  }

  res.render("pages/login");
};

exports.logout = (req, res) => {
  req.logout(() => {
    req.session.destroy(() => {
      res.redirect("/login");
    });
  });
};
