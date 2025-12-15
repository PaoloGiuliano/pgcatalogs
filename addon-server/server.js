require("dotenv").config();

const express = require("express");
const session = require("express-session");
const passport = require("./auth/passport");

const app = express();

app.set("trust proxy", 1);
app.set("view engine", "ejs");
app.set("views", __dirname + "/views");

app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(
  session({
    secret: "8e7KGwdQHLyxh6jcrekiCULzYRb4fPXp3Nnu8SR0lVE=",
    resave: false,
    saveUninitialized: false,
  })
);

app.use(passport.initialize());
app.use(passport.session());

// ROUTES
app.use("/", require("./routes/auth.routes"));
app.use("/", require("./routes/dashboard.routes"));
app.use("/catalogs", require("./routes/catalog.routes"));
app.use("/addon", require("./routes/stremio.routes"));

app.listen(7001, () => {
  console.log("Server running on http://localhost:7001");
});
