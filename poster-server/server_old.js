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
// HELPERS
// ----------------------------------
function loadRatings() {
  if (!fs.existsSync(RATINGS_FILE)) return {};
  const raw = fs.readFileSync(RATINGS_FILE, "utf8");
  return JSON.parse(raw);
}

// Safe rating sanitizer
function valid(val) {
  if (val === null || val === undefined) return false;
  if (typeof val === "number" && val <= 0) return false;
  if (val === "N/A") return false;
  return true;
}

async function getTmdbMovie(tmdbId) {
  const url = `https://api.themoviedb.org/3/movie/${tmdbId}?language=en-US`;
  const res = await fetch(url, {
    headers: {
      accept: "application/json",
      Authorization: `Bearer ${TMDB_TOKEN}`,
    },
  });
  if (!res.ok) throw new Error(`TMDB error ${res.status}`);
  return res.json();
}

async function downloadPoster(posterPath) {
  const url = `https://image.tmdb.org/t/p/w500${posterPath}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Poster download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// ----------------------------------
// MAIN GENERATOR FUNCTION
// ----------------------------------
async function generatePosterBuffer(tmdbId) {
  const ratings = loadRatings();
  const r = ratings[tmdbId.toString()] || {};

  // Build list of valid rating blocks (dynamic)
  const blocks = [];

  if (valid(r.imdb)) {
    blocks.push({
      label: r.imdb.toFixed(1),
      logo: "imdb.png"
    });
  }

  if (valid(r.metascore)) {
    blocks.push({
      label: String(r.metascore),
      logo: "meta.png"
    });
  }

  if (valid(r.rt)) {
    blocks.push({
      label: `${r.rt}%`,
      logo: "rt.png"
    });
  }

  // If no ratings → return original poster (no overlay)
  const movie = await getTmdbMovie(tmdbId);
  if (!movie.poster_path) throw new Error("No poster_path");

  const original = await downloadPoster(movie.poster_path);

  // Resize
  const base = await sharp(original)
    .resize({ width: 500 })
    .jpeg({ quality: 90 })
    .toBuffer();

  if (blocks.length === 0) {
    return base; // no overlay needed
  }

  const meta = await sharp(base).metadata();
  const width = meta.width;

  // Top strip config
  const BAND_H = 80;
  const LOGO_HEIGHT = 40;

  const logoY = Math.floor((BAND_H - LOGO_HEIGHT) / 2);
  const FONT_SIZE = 32;
  const textYOffset = BAND_H - 25;

  // Compute horizontal positions dynamically
  const sectionWidth = width / blocks.length;

  // Build overlay SVG for texts
  let textSvgParts = [];
  let composites = [];

  // Background strip
  const overlaySvg = `
    <svg width="${width}" height="${BAND_H}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${BAND_H}" fill="rgba(0,0,0,0.55)" />
    </svg>
  `;

  composites.push({
    input: Buffer.from(overlaySvg),
    top: 0,
    left: 0
  });

  // Generate blocks
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const centerX = sectionWidth * i + sectionWidth / 2 - 20;

    // LOGO
    const logoPath = path.join(__dirname, "logos", block.logo);
    const logoBuf = await sharp(logoPath)
      .resize(null, LOGO_HEIGHT)
      .toBuffer();

    composites.push({
      input: logoBuf,
      top: logoY,
      left: Math.floor(centerX - LOGO_HEIGHT * 1.1)
    });

    // TEXT (SVG)
    textSvgParts.push(`
      <text x="${centerX + LOGO_HEIGHT * 0.2}"
            y="${textYOffset}"
            text-anchor="start"
            font-family="sans-serif"
            font-size="${FONT_SIZE}px"
            font-weight="bold"
            fill="white">${block.label}</text>
    `);
  }

  const textSvg = `
    <svg width="${width}" height="${BAND_H}" xmlns="http://www.w3.org/2000/svg">
      ${textSvgParts.join("\n")}
    </svg>
  `;

  composites.push({
    input: Buffer.from(textSvg),
    top: 0,
    left: 0
  });

  // Final composite
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
    // Cache hit
    if (fs.existsSync(targetPath)) {
      return res.sendFile(targetPath);
    }

    console.log(`Generating poster for TMDB ID ${tmdbId}`);

    const buf = await generatePosterBuffer(tmdbId);
    fs.writeFileSync(targetPath, buf);
    res.setHeader("Content-Type", "image/jpeg");
    res.send(buf);

  } catch (err) {
    console.error(`Error for TMDB ID ${tmdbId}:`, err.message);
    res.status(500).send("Error generating poster");
  }
});

// ----------------------------------
// START SERVER
// ----------------------------------
const PORT = process.env.PORT || 7000;
app.listen(PORT, () => console.log(`Poster server listening on port ${PORT}`));

