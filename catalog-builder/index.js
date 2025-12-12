// catalog-builder/index.js
// Convert the CLI catalog builder into a reusable function for the web UI.
const Metrics = require("./lib/metrics");
const pLimit = require("p-limit");
const fs = require("fs");
const path = require("path");
const { fetchGenres, discoverMovies, getExternalIds, getCredits, getMovieBundle } = require("./lib/tmdb");
const { getRating } = require("./lib/omdb");
const { computeFinalCriticScore } = require("./lib/scorer");
const MIN_VOTE_AVERAGE = 1;
const MIN_VOTE_COUNT = 100;
// -------------------------------
// Load (or create) a global rating cache
// -------------------------------
const RATINGS_FILE = path.join(__dirname, "ratings.json");
let ratingsCache = {};

try {
    if (fs.existsSync(RATINGS_FILE)) {
        ratingsCache = JSON.parse(fs.readFileSync(RATINGS_FILE, "utf8"));
    }
} catch (e) {
    console.warn("WARNING: Could not parse ratings.json, starting with empty cache.");
    ratingsCache = {};
}

// -------------------------------
// MAIN BUILDER FUNCTION
// -------------------------------
async function buildCatalog(config) {
  const metrics = new Metrics();
  global.metricsInstance = metrics;
    /*
        config = {
            start_year,
            end_year,
            pages,
            language,
            sort_order,
            genres,
            min_critic_score
        }
    */

    const {
        start_year,
        end_year,
        pages,
        language,
        sort_order,
        genres,
        min_critic_score
    } = config;

    const ADULT = false;
    const VIDEO = false;

    // -------------------------------
    // Fetch TMDB genre list to map IDs ↔ names
    // -------------------------------
    const genreData = await fetchGenres(language);

    const GENRE_ID_TO_NAME = {};
    const GENRE_NAME_TO_ID = {};

    if (Array.isArray(genreData.genres)) {
        for (const g of genreData.genres) {
            GENRE_ID_TO_NAME[g.id] = g.name;
            GENRE_NAME_TO_ID[g.name.toLowerCase()] = g.id;
        }
    }

    const WITH_GENRE_IDS = (genres || [])
        .map((name) => GENRE_NAME_TO_ID[name.toLowerCase()])
        .filter((id) => id != null);

    const withGenresParam = WITH_GENRE_IDS.length > 0
        ? WITH_GENRE_IDS.join(",")
        : undefined;

    // -------------------------------
    // Fetch movies (discover) in parallel
    // -------------------------------
    metrics.startDiscover();
    const discoverOptions = {
      language: language,
      include_adult: ADULT,
      include_video: VIDEO,
      "primary_release_date.gte": `${start_year}-01-01`,
      "primary_release_date.lte": `${end_year}-12-31`,
      "vote_average.gte": MIN_VOTE_AVERAGE,
      "vote_count.gte": MIN_VOTE_COUNT,
      sort_by: sort_order,
      with_genres: withGenresParam
    };

    // Create tasks for all pages
    const discoverTasks = [];
    for (let page = 1; page <= pages; page++) {
      discoverTasks.push(discoverMovies(discoverOptions, page));
    }

    // Fetch all pages concurrently
    const discoverResults = await Promise.all(discoverTasks);
    metrics.endDiscover(pages);

    // Flatten results
    const movies = [];
    for (const d of discoverResults) {
      if (Array.isArray(d.results)) {
          movies.push(...d.results.filter(m => m.poster_path)); // filter out movies that don't have a poster
       }
    }
      // -------------------------------
      // Pre-filter movies before expensive TMDB/OMDB calls
      // -------------------------------
    let filteredMovies = movies.filter(m => {
      if (!m.release_date) return false;                         // no release date
      if (m.vote_average == null || m.vote_count == null) return false;  
      if (m.vote_average < MIN_VOTE_AVERAGE) return false;       // fails your minimum rating
      if (m.vote_count < MIN_VOTE_COUNT) return false;           // too few votes

      return true;
    });

    metrics.setFiltering(movies.length, filteredMovies.length);

    // -------------------------------
    // Build the catalog entries
    // -------------------------------

      // Controls how many movies run in parallel.
      // 6–10 is generally safe for TMDB + OMDB.
      const limit = pLimit(8);
      metrics.startProcessing();
      const catalogTasks = filteredMovies.map((m) =>
    limit(async () => {
        try {
            const tmdbId = m.id;

            // TMDB bundle request
            const bundle = await getMovieBundle(tmdbId);
            if (!bundle || !bundle.external_ids || !bundle.credits) {
                console.warn(`TMDB bundle missing for movie ${tmdbId}`);
                return null;
            }

            const externalIds = bundle.external_ids;
            const credits = bundle.credits;

            const imdbId = externalIds.imdb_id;
            if (!imdbId) {
                console.warn(`Missing IMDb ID for TMDB ${tmdbId}`);
                return null;
            }

            // Fire OMDB request
            const ratingPromise = getRating(
                tmdbId,
                imdbId,
                ratingsCache,
                process.env.OMDB_API_KEY
            );

            // Process cast/directors while OMDB runs
            const directors = Array.isArray(credits.crew)
                ? credits.crew
                      .filter((c) => c.job === "Director")
                      .map((d) => d.name)
                      .slice(0, 4)
                : [];

            const cast = Array.isArray(credits.cast)
                ? credits.cast.map((actor) => actor.name).slice(0, 4)
                : [];

            // Await OMDB now
            const rating = await ratingPromise;
            if (!rating) {
                console.warn(`OMDB rating missing for ${imdbId}`);
                return null;
            }

            const imdbRaw = rating.imdb;
            const metascore = rating.metascore;
            const rt = rating.rt;

            const finalScore = computeFinalCriticScore(imdbRaw, metascore, rt);

            const year = m.release_date
                ? String(m.release_date).split("-")[0]
                : undefined;

            const genresFinal = Array.isArray(m.genre_ids)
                ? m.genre_ids.map((gid) => GENRE_ID_TO_NAME[gid]).filter(Boolean)
                : [];
            metrics.incSuccess();
            return {
                id: imdbId,
                type: "movie",
                name: m.title,
                poster: `https://pgcatalogs.duckdns.org/posters/${tmdbId}.jpg`,
                logo: `https://images.metahub.space/logo/medium/${imdbId}/img`,
                description: m.overview,
                year,
                genres: genresFinal,
                director: directors,
                cast,
                metascore,
                imdb_rating: imdbRaw,
                rotten_tomatoes: rt,
                final_critic_score: Math.round(finalScore * 10) / 10
            };
        } catch (err) {
            console.warn(`Error building movie ${m.id}: ${err.message}`);
            metrics.incFailure();
            return null;
        }
    })
);



// Execute all tasks in parallel with concurrency limit
const catalog = await Promise.all(catalogTasks);
metrics.endProcessing(filteredMovies.length);
const catalogClean = catalog.filter(Boolean);


    // -------------------------------
    // Filter by critic score + sort
    // -------------------------------
    const filtered = catalogClean
        .filter((item) => {
            const score = item.final_critic_score ?? 0;
            return score >= (min_critic_score || 0);
        })
        .sort((a, b) => {
            const scoreA = a.final_critic_score ?? 0;
            const scoreB = b.final_critic_score ?? 0;
            return scoreB - scoreA;
        });

    // -------------------------------
    // Save updated ratings cache
    // -------------------------------
    try {
        fs.writeFileSync(RATINGS_FILE, JSON.stringify(ratingsCache, null, 2));
    } catch (e) {
        console.warn("WARNING: Could not write ratings cache:", e.message);
    }

    // Return filtered catalog (what Express will save to disk)
    metrics.print();
    return filtered;
}

module.exports = buildCatalog;
