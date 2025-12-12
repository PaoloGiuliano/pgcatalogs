// stremio/catalog-builder/catalog-rating-builder.js
const fs = require("fs");
const path = require("path");

const { createCli } = require("./lib/cli");
const { fetchGenres, discoverMovies, getExternalIds, getCredits } = require("./lib/tmdb");
const { getRating } = require("./lib/omdb");
const { computeFinalCriticScore } = require("./lib/scorer");

// -------------------------------------------------------------------
// ENVIRONMENT CHECK
// -------------------------------------------------------------------
const TMDB_TOKEN = process.env.TMDB_TOKEN;
if (!TMDB_TOKEN) {
  console.error("ERROR: Set TMDB_TOKEN environment variable");
  process.exit(1);
}

// OMDB key is optional but strongly recommended.
const OMDB_API_KEY = process.env.OMDB_API_KEY;
if (!OMDB_API_KEY) {
  console.warn("WARNING: OMDB_API_KEY is not set. OMDB lookups will likely fail or return empty data.");
}

// -------------------------------------------------------------------
// LOAD RATING CACHE
// -------------------------------------------------------------------
const RATINGS_FILE = "ratings.json";
let ratingsCache = {};
if (fs.existsSync(RATINGS_FILE)) {
  try {
    ratingsCache = JSON.parse(fs.readFileSync(RATINGS_FILE, "utf8"));
  } catch (e) {
    console.error("WARNING: Could not parse ratings.json, starting with empty cache.");
    ratingsCache = {};
  }
}

// -------------------------------------------------------------------
// VALID SETS
// -------------------------------------------------------------------
const VALID_LANGUAGES = [
  "en-US", "en-GB", "fr-FR", "es-ES", "de-DE", "it-IT", "ja-JP", "ko-KR", "zh-CN"
];

const VALID_SORT = [
  "original_title.asc", "original_title.desc",
  "popularity.asc", "popularity.desc",
  "revenue.asc", "revenue.desc",
  "primary_release_date.asc", "primary_release_date.desc",
  "title.asc", "title.desc",
  "vote_average.asc", "vote_average.desc",
  "vote_count.asc", "vote_count.desc"
];

const VALID_GENRES = [
  "action", "adventure", "animation", "comedy", "crime", "documentary",
  "drama", "family", "fantasy", "history", "horror", "music", "mystery",
  "romance", "science fiction", "tv movie", "thriller", "war", "western"
];

// -------------------------------------------------------------------
// MAIN
// -------------------------------------------------------------------
async function main() {
  const cli = createCli();

  try {
    // -------------------------------------------------------------------
    // PROMPTS (interactive)
    // -------------------------------------------------------------------
    const START_YEAR = await cli.askInt("Enter start year", { min: 1900, max: 2100 });
    const END_YEAR = await cli.askInt("Enter end year", { min: 1900, max: 2100 });
    //const VOTE_AVG_MIN = await cli.askFloatRange("Minimum vote_average", { min: 0.0, max: 10.0 });
    //const VOTE_COUNT_MIN = await cli.askInt("Minimum vote_count", { min: 0, max: 999999 });
    const PAGES = await cli.askInt("How many pages to fetch from TMDB?", { min: 1, max: 50 });

    const LANGUAGE = await cli.askChoice("Select language (TMDB format)", VALID_LANGUAGES);
    const SORT_BY = await cli.askChoice("Select sort order", VALID_SORT);

    // Forced to false to match your Ruby script.
    const ADULT = false;
    const VIDEO = false;

    const CATALOG_NAME = await cli.askCatalogName();
    const WITH_GENRES = await cli.askGenres(VALID_GENRES);

    const MIN_CRITIC_SCORE = await cli.askInt("Minimum critic score", { min: 0, max: 100 });

    // -------------------------------------------------------------------
    // Fetch genres from TMDB
    // -------------------------------------------------------------------
    const genreData = await fetchGenres(LANGUAGE);

    const GENRE_ID_TO_NAME = {};
    const GENRE_NAME_TO_ID = {};

    if (Array.isArray(genreData.genres)) {
      for (const g of genreData.genres) {
        GENRE_ID_TO_NAME[g.id] = g.name;
        GENRE_NAME_TO_ID[g.name.toLowerCase()] = g.id;
      }
    }

    const WITH_GENRE_IDS = WITH_GENRES
      .map((name) => GENRE_NAME_TO_ID[name.toLowerCase()])
      .filter((id) => id != null);

    console.log(`Using genre filters: ${JSON.stringify(WITH_GENRE_IDS)}`);

    const withGenresParam =
      WITH_GENRE_IDS.length > 0 ? WITH_GENRE_IDS.join(",") : undefined;

    // -------------------------------------------------------------------
    // Fetch movies (discover)
    // -------------------------------------------------------------------
    const movies = [];

    for (let page = 1; page <= PAGES; page++) {
      console.log(`Fetching page ${page}/${PAGES}...`);

      const discoverOptions = {
        language: LANGUAGE,
        include_adult: ADULT,
        include_video: VIDEO,
        primary_release_date_gte: `${START_YEAR}-01-01`,
        primary_release_date_lte: `${END_YEAR}-12-31`,
        //vote_average_gte: VOTE_AVG_MIN,
        //vote_count_gte: VOTE_COUNT_MIN,
        sort_by: SORT_BY,
        with_genres: withGenresParam
      };

      const data = await discoverMovies(discoverOptions, page);
      if (Array.isArray(data.results)) {
        movies.push(...data.results);
      }
    }

    console.log(`Total movies fetched: ${movies.length}`);

    // -------------------------------------------------------------------
    // Build Catalog Items
    // -------------------------------------------------------------------
    const catalog = [];

    for (const m of movies) {
      const tmdbId = m.id;

      const externalIds = await getExternalIds(tmdbId);
      const imdbId = externalIds.imdb_id;

      const credits = await getCredits(tmdbId);

      const directors = Array.isArray(credits.crew)
        ? credits.crew
            .filter((c) => c.job === "Director")
            .map((d) => d.name)
            .slice(0, 4)
        : [];

      const cast = Array.isArray(credits.cast)
        ? credits.cast.map((actor) => actor.name).slice(0, 4)
        : [];

      const rating = await getRating(tmdbId, imdbId, ratingsCache, OMDB_API_KEY);

      const imdbRaw = rating.imdb;
      const metascore = rating.metascore;
      const rt = rating.rt;

      const finalScore = computeFinalCriticScore(imdbRaw, metascore, rt);

      const year = m.release_date ? String(m.release_date).split("-")[0] : undefined;
      const genres = Array.isArray(m.genre_ids)
        ? m.genre_ids.map((gid) => GENRE_ID_TO_NAME[gid]).filter(Boolean)
        : [];

      catalog.push({
        id: imdbId || String(tmdbId),
        type: "movie",
        name: m.title,
        poster: `https://pgcatalogs.duckdns.org/posters/${tmdbId}.jpg`,
        description: m.overview,
        year: year,
        genres: genres,
        director: directors,
        cast: cast,
        metascore: metascore,
        imdb_rating: imdbRaw,
        rotten_tomatoes: rt,
        final_critic_score: Math.round(finalScore * 10) / 10
      });
    }

    // -------------------------------------------------------------------
    // Final Critic Rating Filter + Sort
    // -------------------------------------------------------------------
    let filtered = catalog.filter((item) => {
      const score = item.final_critic_score ?? item["final_critic_score"];
      return score != null && score >= MIN_CRITIC_SCORE;
    });

    filtered.sort((a, b) => {
      const scoreA = a.final_critic_score ?? a["final_critic_score"] ?? 0;
      const scoreB = b.final_critic_score ?? b["final_critic_score"] ?? 0;
      return scoreB - scoreA;
    });

    // -------------------------------------------------------------------
    // Save Catalog
    // -------------------------------------------------------------------
    const outDir = path.join("data", "catalogs");
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, `${CATALOG_NAME}.json`);

    fs.writeFileSync(outPath, JSON.stringify(filtered, null, 2), "utf8");
    console.log(`Saved ${CATALOG_NAME}.json with ${filtered.length} movies.`);

    // -------------------------------------------------------------------
    // SAVE RATING CACHE
    // -------------------------------------------------------------------
    fs.writeFileSync(RATINGS_FILE, JSON.stringify(ratingsCache, null, 2), "utf8");
    console.log(`Updated ratings.json with ${Object.keys(ratingsCache).length} items.`);
  } catch (err) {
    console.error("ERROR:", err.message);
  } finally {
    cli.close();
  }
}

main();
