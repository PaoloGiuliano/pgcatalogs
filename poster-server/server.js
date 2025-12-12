const fs = require("fs");
const path = require("path");
const express = require("express");
const sharp = require("sharp");

const app = express();

// ----------------------------------
// CONFIG — directories
// ----------------------------------
const RATINGS_FILE = path.join(__dirname, "../catalog-builder/ratings.json");
const POSTERS_DIR  = path.join(__dirname, "posters");
const LOGOS_DIR    = path.join(__dirname, "logos");
const FALLBACK_POSTER = path.join(__dirname, "fallback.jpg");
let fallbackPosterBuf = null;
fallbackPosterBuf = fs.existsSync(FALLBACK_POSTER) ? fs.readFileSync(FALLBACK_POSTER) : null;

if (!fs.existsSync(POSTERS_DIR)) {
  fs.mkdirSync(POSTERS_DIR, { recursive: true });
}

// ----------------------------------
// ENVIRONMENT CHECK
// ----------------------------------
const TMDB_TOKEN = process.env.TMDB_TOKEN;
if (!TMDB_TOKEN) {
  console.error("ERROR: TMDB_TOKEN env var not set");
  process.exit(1);
}

// ----------------------------------
// IN-MEMORY CACHES
// ----------------------------------
let ratingsCache = {};
let lastRatingsLoad = 0;
const tmdbCache = new Map();
const logoCache = {};

// ----------------------------------
// HELPERS
// ----------------------------------
function loadRatings() {
  const now = Date.now();

  // Reload ratings every 10 seconds
  if (now - lastRatingsLoad > 10_000) {
    if (fs.existsSync(RATINGS_FILE)) {
      ratingsCache = JSON.parse(fs.readFileSync(RATINGS_FILE, "utf8"));
    }
    lastRatingsLoad = now;
  }

  return ratingsCache;
}

function valid(val) {
  if (val === null || val === undefined) return false;
  if (typeof val === "number" && val <= 0) return false;
  if (val === "N/A") return false;
  return true;
}

async function getTmdbMovie(tmdbId) {
  // In-memory TMDB cache
  if (tmdbCache.has(tmdbId)) {
    return tmdbCache.get(tmdbId);
  }

  const url = `https://api.themoviedb.org/3/movie/${tmdbId}?language=en-US`;
  const res = await fetch(url, {
    headers: {
      accept: "application/json",
      Authorization: `Bearer ${TMDB_TOKEN}`,
    },
  });

  if (!res.ok) {
    throw new Error(`TMDB error ${res.status}`);
  }

  const data = await res.json();
  tmdbCache.set(tmdbId, data);
  return data;
}

async function downloadPoster(posterPath) {
  const url = `https://image.tmdb.org/t/p/w500${posterPath}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Poster download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// ----------------------------------
// LOGO PRELOAD
// ----------------------------------
async function preloadLogos() {
  const files = ["imdb.png", "meta.png", "rt.png"];

  for (const filename of files) {
    const fullPath = path.join(LOGOS_DIR, filename);

    // Resize once → store buffer in memory
    logoCache[filename] = await sharp(fullPath)
      .resize(null, 40)
      .toBuffer();
  }

  console.log("Logos preloaded.");
}

// ----------------------------------
// MAIN GENERATOR
// ----------------------------------
async function generatePosterBuffer(tmdbId) {
  const ratings = loadRatings();
  const movie = await getTmdbMovie(tmdbId);

  if (!movie.poster_path) {
    // Use fallback image if available
    if (fallbackPosterBuf) {
      return fallbackPosterBuf;
    }
    throw new Error("No poster_path");
  }

  const imdbId = movie.imdb_id;
  const r = imdbId ? ratings[imdbId] || {} : {};

  // Build rating blocks
  const blocks = [];

  if (valid(r.imdb)) {
    blocks.push({ label: r.imdb.toFixed(1), logo: "imdb.png" });
  }
  if (valid(r.metascore)) {
    blocks.push({ label: String(r.metascore), logo: "meta.png" });
  }
  if (valid(r.rt)) {
    blocks.push({ label: `${r.rt}%`, logo: "rt.png" });
  }

  const original = await downloadPoster(movie.poster_path);

  const base = await sharp(original)
    .resize({ width: 500 })
    .jpeg({ quality: 90 })
    .toBuffer();

  if (blocks.length === 0) {
    return base;
  }

  const width = 500; // known after resize
  const BAND_H = 80;
  const LOGO_H = 40;

  const logoY = Math.floor((BAND_H - LOGO_H) / 2);
  const FONT_SIZE = 32;
  const textYOffset = BAND_H - 25;

  const sectionWidth = width / blocks.length;

  let composites = [];
  let textSvgParts = [];

  // Background strip
  composites.push({
    input: Buffer.from(`
      <svg width="${width}" height="${BAND_H}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${width}" height="${BAND_H}" fill="rgba(0,0,0,0.55)" />
      </svg>
    `),
    top: 0,
    left: 0
  });

  // Build rating overlays
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const centerX = sectionWidth * i + sectionWidth / 2 - 20;

    // Use preloaded logo buffer
    const logoBuf = logoCache[b.logo];

    composites.push({
      input: logoBuf,
      top: logoY,
      left: Math.floor(centerX - LOGO_H * 1.1)
    });

    textSvgParts.push(`
      <text x="${centerX + LOGO_H * 0.2}"
            y="${textYOffset}"
            text-anchor="start"
            font-family="sans-serif"
            font-size="${FONT_SIZE}"
            font-weight="bold"
            fill="white">${b.label}</text>
    `);
  }

  // Text SVG
  composites.push({
    input: Buffer.from(`
      <svg width="${width}" height="${BAND_H}" xmlns="http://www.w3.org/2000/svg">
        ${textSvgParts.join("\n")}
      </svg>
    `),
    top: 0,
    left: 0
  });

  return sharp(base)
    .composite(composites)
    .jpeg({ quality: 90 })
    .toBuffer();
}

// ----------------------------------
// EXPRESS ROUTE
// ----------------------------------
app.get("/posters/:tmdbId.jpg", async (req, res) => {
  const tmdbId = req.params.tmdbId;
  const targetPath = path.join(POSTERS_DIR, `${tmdbId}.jpg`);

  try {
    if (fs.existsSync(targetPath)) {
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      return res.sendFile(targetPath);
    }

    console.log(`Generating poster for TMDB ID ${tmdbId}`);
    const buf = await generatePosterBuffer(tmdbId);

    fs.writeFileSync(targetPath, buf);
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.send(buf);

  } catch (err) {
    console.error(`Error for TMDB ID ${tmdbId}:`, err.message);
    res.status(500).send("Error generating poster");
  }
});

// ----------------------------------
// START SERVER
// ----------------------------------
(async () => {
  await preloadLogos();

  const PORT = process.env.PORT || 7000;
  app.listen(PORT, () => console.log(`Poster server listening on port ${PORT}`));
})();

