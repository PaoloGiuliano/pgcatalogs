exports.show = (req, res) => {
  const installUrl = `https://pgcatalogs.duckdns.org/addon/user/${req.user.user_uuid}/manifest.json`;

  res.render("pages/dashboard", {
    user: req.user,
    installUrl,
  });
};
