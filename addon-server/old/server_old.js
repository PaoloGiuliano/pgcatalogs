const express = require("express");
const session = require("express-session");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const crypto = require("crypto");
const db = require("./db");
const buildCatalog = require("../catalog-builder/index.js");  // we will fill this file next
const fs = require("fs");
const path = require("path");
const GENERATED_DIR = path.join(__dirname, "generated");
// Ensure base directory exists
if (!fs.existsSync(GENERATED_DIR)) {
    fs.mkdirSync(GENERATED_DIR, { recursive: true });
}

require("dotenv").config();

const app = express();
app.set("trust proxy", 1);

// SESSION
app.use(session({
    secret: "8e7KGwdQHLyxh6jcrekiCULzYRb4fPXp3Nnu8SR0lVE=",
    resave: false,
    saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// PASSPORT
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
    const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
    done(null, row || false);
});

// GOOGLE STRATEGY
passport.use(new GoogleStrategy(
    {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: "https://pgcatalogs.duckdns.org/auth/google/callback"
    },
    (accessToken, refreshToken, profile, done) => {

    try{
        const googleId = profile.id;
        const name = profile.displayName;
        const email = profile.emails?.[0]?.value;
        

        let user = db.prepare("SELECT * FROM users WHERE google_id = ?").get(googleId);

        if (!user) {
          const user_uuid = crypto.randomUUID();
          db.prepare(`
            INSERT INTO users (user_uuid, google_id, email)
            VALUES (?,?,?)
          `).run(user_uuid, googleId, email);

          user = db.prepare("SELECT * FROM  users WHERE user_uuid = ?").get(user_uuid);
          


        }

      if (!user.user_uuid) {
        const {v4:uuidv4} = require("uuid");
        const newUuid = uuidv4();

        db.prepare("UPDATE userse SET user_uuid = ? WHERE id = ?").run(newUuid, user.id);
        user.user_uuid = newUuid;

      }

      //const fs = require("fs");
      //const path = require("path");

      const userBaseDir = path.join(__dirname, "generated", user.user_uuid);
      const catalogDir = path.join(userBaseDir, "catalogs");
      
      fs.mkdirSync(catalogDir, {recursive: true });

      // Continue Login
      
      return done(null, user);
    } catch (err){
      return done(err)
    }
  
  }));
//
//
// Shuffle Function 
//
function shuffle(arr) {
    const a = [...arr]; // copy so we do not modify the original JSON file
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}



// ------------------------
// ROUTES
// ------------------------

// LOGIN PAGE
app.get("/login", (req, res) => {
    if (req.user) {
        return res.redirect("/dashboard");
    }
    res.send(`<a href="/auth/google">Login with Google</a>`);
});

// GOOGLE LOGIN
app.get("/auth/google",
    passport.authenticate("google", { scope: ["profile", "email"] })
);

// GOOGLE CALLBACK
app.get("/auth/google/callback",
    passport.authenticate("google", { failureRedirect: "/login" }),
    (req, res) => res.redirect("/dashboard")
);

// LOGOUT
app.get("/logout", (req, res) => {
    req.logout(() => {
        req.session.destroy(() => res.redirect("/login"));
    });
});

// AUTH MIDDLEWARE
//
function ensureLoggedIn(req, res, next) {
    if (!req.user) return res.redirect('/login');
    next();
}
// CONFIGURE REDIRECT TO DASHBOARD
app.get("/addon/user/:uuid/configure", (req, res) => {
    const uuid = req.params.uuid;
    res.redirect(`https://pgcatalogs.duckdns.org/dashboard`);
});

// DASHBOARD
app.get("/dashboard", ensureLoggedIn, (req, res) => {
    const installUrl = `https://pgcatalogs.duckdns.org/addon/user/${req.user.user_uuid}/manifest.json`;

    res.send(`
        <h1>Welcome, ${req.user.display_name}</h1>

        <h2>Your PG Catalogs Addon</h2>

        <p>Install your personal Stremio addon using the link below:</p>
 <p>
  <a href="stremio://pgcatalogs.duckdns.org/addon/user/${req.user.user_uuid}/manifest.json" target="_blank">
    Install
  </a>
</p>
 <p>
  <a href="https://web.stremio.com/#/addons?addon=https://pgcatalogs.duckdns.org/addon/user/${req.user.user_uuid}/manifest.json" target="_blank">
    Install (Web)
  </a>
</p>





       <button onclick="navigator.clipboard.writeText('${installUrl}')">
            Copy Install Link
        </button>

        <h2>Catalogs</h2>
        <p><a href="/catalogs">View Your Catalogs</a></p>
        <p><a href="/catalogs/new">Create New Catalog</a></p>
    `);
});

// CATALOGS
app.get("/catalogs", ensureLoggedIn, (req, res) => {
    const catalogs = db.prepare(`
        SELECT * FROM catalogs WHERE user_id = ?
    `).all(req.user.id);

    let html = "<h1>Your Catalogs</h1>";
    html += `<p><a href="/catalogs/new">Create New Catalog</a></p>`;

    if (catalogs.length === 0) {
        html += "<p>No catalogs yet.</p>";
        return res.send(html);
    }

    html += "<ul>";
    for (const c of catalogs) {
        html += `
            <li>
                <strong>${c.name}</strong>
                <br>
                <a href="/catalogs/${c.id}/edit">Edit</a> |
                <a href="/catalogs/${c.id}/delete" onclick="return confirm('Delete this catalog?');">Delete</a>
            </li>
            <br>
        `;
    }
    html += "</ul>";

    res.send(html);
});

//////////////////////////
///CATALOGS GET CREATE///
////////////////////////
app.get("/catalogs/new", ensureLoggedIn, (req, res) => {
    res.send(`
        <h1>Create Catalog</h1>

        <form method="POST" action="/catalogs/new">

            <label>Catalog Name (no spaces)</label><br>
            <input name="name" required pattern="^[A-Za-z0-9_-]+$"><br><br>

            <label>Start Year (1900-2100)</label><br>
            <input type="number" name="start_year" min="1900" max="2100" required><br><br>

            <label>End Year (1900-2100)</label><br>
            <input type="number" name="end_year" min="1900" max="2100" required><br><br>

            <label>Pages to fetch (1-50)</label><br>
            <input type="number" name="pages" min="1" max="50" required><br><br>

            <label>Language</label><br>
            <select name="language" required>
                <option value="en-US">en-US</option>
                <option value="en-GB">en-GB</option>
                <option value="fr-FR">fr-FR</option>
                <option value="es-ES">es-ES</option>
                <option value="de-DE">de-DE</option>
                <option value="it-IT">it-IT</option>
                <option value="ja-JP">ja-JP</option>
                <option value="ko-KR">ko-KR</option>
                <option value="zh-CN">zh-CN</option>
            </select><br><br>

            <label>Sort Order</label><br>
            <select name="sort_order" required>
                <option>original_title.asc</option>
                <option>original_title.desc</option>
                <option>popularity.asc</option>
                <option>popularity.desc</option>
                <option>revenue.asc</option>
                <option>revenue.desc</option>
                <option>primary_release_date.asc</option>
                <option>primary_release_date.desc</option>
                <option>title.asc</option>
                <option>title.desc</option>
            </select><br><br>

<label>Select Genres</label><br>

<input type="checkbox" name="genres" value="action"> Action<br>
<input type="checkbox" name="genres" value="adventure"> Adventure<br>
<input type="checkbox" name="genres" value="animation"> Animation<br>
<input type="checkbox" name="genres" value="comedy"> Comedy<br>
<input type="checkbox" name="genres" value="crime"> Crime<br>
<input type="checkbox" name="genres" value="documentary"> Documentary<br>
<input type="checkbox" name="genres" value="drama"> Drama<br>
<input type="checkbox" name="genres" value="family"> Family<br>
<input type="checkbox" name="genres" value="fantasy"> Fantasy<br>
<input type="checkbox" name="genres" value="history"> History<br>
<input type="checkbox" name="genres" value="horror"> Horror<br>
<input type="checkbox" name="genres" value="music"> Music<br>
<input type="checkbox" name="genres" value="mystery"> Mystery<br>
<input type="checkbox" name="genres" value="romance"> Romance<br>
<input type="checkbox" name="genres" value="science fiction"> Science Fiction<br>
<input type="checkbox" name="genres" value="thriller"> Thriller<br>
<input type="checkbox" name="genres" value="tv movie"> TV Movie<br>
<input type="checkbox" name="genres" value="war"> War<br>
<input type="checkbox" name="genres" value="western"> Western<br><br>

            <label>Minimum critic score (0-100)</label><br>
            <input type="number" name="min_critic_score" min="0" max="100"><br><br>

            <button type="submit">Create Catalog</button>
        </form>

        <p><a href="/dashboard">Back</a></p>
    `);
});

///////////////////////////
///CATALOGS POST CREATE///
/////////////////////////
app.post("/catalogs/new", ensureLoggedIn, async (req, res) => {
    const {
        name,
        start_year,
        end_year,
        pages,
        language,
        sort_order,
        min_critic_score
    } = req.body;

    // ----------------------------
    // Validation
    // ----------------------------

    if (!name || !/^[A-Za-z0-9_-]+$/.test(name)) {
        return res.send("Invalid name. Use letters, numbers, underscores or dashes. No spaces.");
    }

    const sy = Number(start_year);
    const ey = Number(end_year);
    const pg = Number(pages);
    const mcrit = min_critic_score ? Number(min_critic_score) : null;

    if (isNaN(sy) || sy < 1900 || sy > 2100) return res.send("Invalid start year.");
    if (isNaN(ey) || ey < 1900 || ey > 2100) return res.send("Invalid end year.");
    if (ey < sy) return res.send("End year cannot be less than start year.");

    if (isNaN(pg) || pg < 1 || pg > 50) return res.send("Invalid pages count.");

    if (!language) return res.send("Language required.");
    if (!sort_order) return res.send("Sort order required.");

    // Handle genres (checkboxes)
    let genres = [];
    if (req.body.genres) {
        if (Array.isArray(req.body.genres)) {
            genres = req.body.genres.map(g => g.trim().toLowerCase());
        } else {
            genres = [req.body.genres.trim().toLowerCase()];
        }
    }

    if (mcrit !== null && (isNaN(mcrit) || mcrit < 0 || mcrit > 100)) {
        return res.send("Invalid critic score (0–100).");
    }

    // ----------------------------
    // Build config JSON
    // ----------------------------
    const configObj = {
        start_year: sy,
        end_year: ey,
        pages: pg,
        language,
        sort_order,
        genres,
        min_critic_score: mcrit
    };

    // ----------------------------
    // 1. Insert catalog metadata into DB
    // ----------------------------
    const insert = db.prepare(`
        INSERT INTO catalogs (user_id, name, config_json)
        VALUES (?, ?, ?)
    `);

    const result = insert.run(
        req.user.id,
        name,
        JSON.stringify(configObj)
    );

    const catalogId = result.lastInsertRowid;

    // ----------------------------
    // 2. Generate catalog JSON using builder
    // ----------------------------
    let outputJson;

    try {
        outputJson = await buildCatalog(configObj);
    } catch (err) {
        return res.send("Error generating catalog: " + err.message);
    }

    // ----------------------------
    // 3. Write JSON file to /generated/<uuid>/catalogs/
    // ----------------------------
    const filePath = path.join(
        __dirname,
        "generated",
        req.user.user_uuid,
        "catalogs",
        `catalog_${catalogId}.json`
    );

    try {
        fs.writeFileSync(filePath, JSON.stringify(outputJson, null, 2));
    } catch (err) {
        return res.send("Error writing catalog file: " + err.message);
    }

    // ----------------------------
    // 4. Update DB with file path + timestamp
    // ----------------------------
    db.prepare(`
        UPDATE catalogs
        SET generated_path = ?, last_generated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(filePath, catalogId);

    // ----------------------------
    // 5. Redirect back to catalog list
    // ----------------------------
    res.redirect("/catalogs");
});

/////////////////////
///CATALOG DELETE///
///////////////////
app.get("/catalogs/:id/delete", ensureLoggedIn, (req, res) => {
    const catalogId = req.params.id;

    // Verify catalog belongs to user
    const catalog = db.prepare(`
        SELECT * FROM catalogs WHERE id = ? AND user_id = ?
    `).get(catalogId, req.user.id);

    if (!catalog) {
        return res.send("<p>Catalog not found.</p>");
    }

    // Delete JSON file if exists
    if (catalog.generated_path && fs.existsSync(catalog.generated_path)) {
        fs.unlinkSync(catalog.generated_path);
    }

    // Delete DB row
    db.prepare(`DELETE FROM catalogs WHERE id = ?`).run(catalogId);

    return res.redirect("/catalogs");
});

/////////////////////////
///CATALOG GET UPDATE///
///////////////////////
app.get("/catalogs/:id/edit", ensureLoggedIn, (req, res) => {
    const catalogId = req.params.id;

    const catalog = db.prepare(`
        SELECT * FROM catalogs WHERE id = ? AND user_id = ?
    `).get(catalogId, req.user.id);

    if (!catalog) {
        return res.send("<p>Catalog not found.</p>");
    }

    const config = JSON.parse(catalog.config_json);

    res.send(`
        <h1>Edit Catalog: ${catalog.name}</h1>

        <form method="POST" action="/catalogs/${catalog.id}/edit">
            Name: <input name="name" value="${catalog.name}" required><br><br>

            Start Year: <input name="start_year" type="number" value="${config.start_year}" required><br><br>
            End Year: <input name="end_year" type="number" value="${config.end_year}" required><br><br>
            Pages: <input name="pages" type="number" value="${config.pages}" required><br><br>

            Language: <input name="language" value="${config.language}" required><br><br>
            Sort By: <input name="sort_by" value="${config.sort_by}" required><br><br>

            Genres (comma-separated): <input name="genres" value="${config.genres.join(", ")}"><br><br>

            Min Critic Score: <input name="min_critic_score" type="number" value="${config.min_critic_score}" required><br><br>

            <button type="submit">Save Changes</button>
        </form>
    `);
});
//////////////////////////
///CATALOG POST UPDATE///
////////////////////////
app.post("/catalogs/:id/edit", ensureLoggedIn, async (req, res) => {
    const catalogId = req.params.id;

    const existing = db.prepare(`SELECT * FROM catalogs WHERE id = ? AND user_id = ?`)
        .get(catalogId, req.user.id);

    if (!existing) return res.send("<p>Catalog not found.</p>");

    const config = {
        start_year: parseInt(req.body.start_year),
        end_year: parseInt(req.body.end_year),
        pages: parseInt(req.body.pages),
        language: req.body.language,
        sort_by: req.body.sort_by,
        genres: req.body.genres.split(",").map(g => g.trim()),
        min_critic_score: parseInt(req.body.min_critic_score)
    };

    // Update DB
    db.prepare(`
        UPDATE catalogs
        SET name = ?, config_json = ?, last_generated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
    `).run(req.body.name, JSON.stringify(config), catalogId, req.user.id);

    // File path
  const userDir = path.join(GENERATED_DIR, req.user.user_uuid, "catalogs");

    // Ensure directory exists
    if (!fs.existsSync(userDir)) {
       fs.mkdirSync(userDir, { recursive: true });
    }
    const filePath = path.join(userDir, `catalog_${catalogId}.json`);

    // Rebuild catalog
    const data = await buildCatalog(config);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

    // Update path
    db.prepare(`UPDATE catalogs SET generated_path = ? WHERE id = ?`)
        .run(filePath, catalogId);

    res.redirect("/catalogs");
});

// ---------------------------------------------
// STREMIO MANIFEST — per user
// ---------------------------------------------
app.get("/addon/user/:uuid/manifest.json", (req, res) => {
    const userUuid = req.params.uuid;

    const user = db.prepare(`
        SELECT * FROM users WHERE user_uuid = ?
    `).get(userUuid);

    if (!user) {
        return res.status(404).json({ error: "User not found" });
    }

    const catalogs = db.prepare(`
        SELECT id, name FROM catalogs WHERE user_id = ?
    `).all(user.id);

    const manifest = {
        id: `pgcatalogs.${userUuid}`,
        version: "1.0.0",
        name: "PG Catalogs",
        description: "User-specific Stremio catalogs",
        types: ["movie"],
        resources:[
          "catalog",
          {
            name:"meta",
            types: ["movie"],
            idPrefixes: ["catalog_", "tt", "tmdb", ""]
          }
        ],
        behaviorHints:{
          configurable: true,
        },
        catalogs: catalogs.map(c => ({
            type: "movie",
            id: `catalog_${c.id}`,
            name: c.name,
            extra: [
              {
                name: "search",
                isRequired: false
              }
            ],
            behaviorHints:{
              catalogUrl: `https://pgcatalogs.duckdns.org/addon/user/${userUuid}/catalog/{type}/{id}.json`,
              metaUrl:`https://pgcatalogs.duckdns.org/addon/user/${userUuid}/meta/{type}/{id}.json`
        }}))
    };

    res.json(manifest);
});
// ---------------------------------------------
// STREMIO CATALOG — per user
// ---------------------------------------------


app.get("/addon/user/:uuid/catalog/:type/:catalogId.json", (req, res) => {
    console.log("getting catalog data...");
    const userUuid = req.params.uuid;
    const catalogId = req.params.catalogId.replace("catalog_", "");

    const user = db.prepare(`
        SELECT * FROM users WHERE user_uuid = ?
    `).get(userUuid);

    if (!user) return res.json({ metas: [] });

    const catalog = db.prepare(`
        SELECT * FROM catalogs WHERE id = ? AND user_id = ?
    `).get(catalogId, user.id);

    if (!catalog || !catalog.generated_path) {
        return res.json({ metas: [] });
    }

    try {
        const data = JSON.parse(fs.readFileSync(catalog.generated_path, "utf8"));
        const randomized = shuffle(data);
        res.json({ metas: randomized });
    } catch (err) {
        console.error(err);
        res.json({ metas: [] });
    }
});
// ---------------------------------------------
// STREMIO META — returns one entry by IMDB or TMDB id
// ---------------------------------------------

app.get("/addon/user/:uuid/meta/:type/:metaId.json", (req, res) => {
    const userUuid = req.params.uuid;
    const metaId = req.params.metaId;

    const user = db.prepare(`
        SELECT * FROM users WHERE user_uuid = ?
    `).get(userUuid);

    if (!user) return res.json({ meta: null });

    // Load ALL catalogs for the user
    const list = db.prepare(`
        SELECT generated_path FROM catalogs WHERE user_id = ?
    `).all(user.id);

    // Search all movies
    for (const row of list) {
        if (!row.generated_path) continue;

        try {
            const data = JSON.parse(fs.readFileSync(row.generated_path, "utf8"));
            const found = data.find(item => item.id === metaId);
            

            if (found) {
              return res.json({
                    meta: {
                        id: found.id,
                        type: found.type,
                        name: found.name,
                        poster: found.poster,
                        description: found.description,
                        year: found.year,
                        genres: found.genres,
                        director: found.director || [],
                        cast: found.cast || []
                    }
                });
            }
        } catch (err) {
            continue;
        }
    }

    res.json({ meta: null });
});

app.listen(7001, () => {
    console.log("Server running on http://localhost:7001");
});
