// catalog-builder/index.js
// Convert the CLI catalog builder into a reusable function for the web UI.
const pLimit = require("p-limit");
const fs = require("fs");
const path = require("path");
const { fetchGenres, discoverMovies, getExternalIds, getCredits } = require("./lib/tmdb");
const { getRating } = require("./lib/omdb");
const { computeFinalCriticScore } = require("./lib/scorer");

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
    /*
        config = {
            start_year,
            end_year,
            min_vote_average,
            min_vote_count,
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
        min_vote_average,
        min_vote_count,
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
    // Fetch movies (discover)
    // -------------------------------
    const movies = [];

    for (let page = 1; page <= pages; page++) {
        const discoverOptions = {
            language: language,
            include_adult: ADULT,
            include_video: VIDEO,
            "primary_release_date.gte": `${start_year}-01-01`,
            "primary_release_date.lte": `${end_year}-12-31`,
            "vote_average.gte": min_vote_average,
            "vote_count.gte": min_vote_count,
            sort_by: sort_order,
            with_genres: withGenresParam
        };

        const data = await discoverMovies(discoverOptions, page);

        if (Array.isArray(data.results)) {
            movies.push(...data.results);
        }
    }

    // -------------------------------
    // Build the catalog entries
    // -------------------------------
const catalog = [];

for (const m of movies) {
    const tmdbId = m.id;

    const externalIds = await getExternalIds(tmdbId);
    const imdbId = externalIds.imdb_id;

    const credits = await getCredits(tmdbId);

    const directors = Array.isArray(credits.crew)
        ? credits.crew.filter((c) => c.job === "Director")
            .map((d) => d.name)
            .slice(0, 4)
        : [];

    const cast = Array.isArray(credits.cast)
        ? credits.cast.map((actor) => actor.name).slice(0, 4)
        : [];

    const rating = await getRating(tmdbId, imdbId, ratingsCache, process.env.OMDB_API_KEY);

    const imdbRaw = rating.imdb;
    const metascore = rating.metascore;
    const rt = rating.rt;

    const finalScore = computeFinalCriticScore(imdbRaw, metascore, rt);

    const year = m.release_date ? String(m.release_date).split("-")[0] : undefined;
    const genresFinal = Array.isArray(m.genre_ids)
        ? m.genre_ids.map((gid) => GENRE_ID_TO_NAME[gid]).filter(Boolean)
        : [];

    catalog.push({
        id: imdbId || String(tmdbId),
        type: "movie",
        name: m.title,
        poster: `https://pgcatalogs.duckdns.org/posters/${tmdbId}.jpg`,
        description: m.overview,
        year,
        genres: genresFinal,
        director: directors,
        cast,
        metascore,
        imdb_rating: imdbRaw,
        rotten_tomatoes: rt,
        final_critic_score: Math.round(finalScore * 10) / 10
    });
}

    // -------------------------------
    // Filter by critic score + sort
    // -------------------------------
    const filtered = catalog
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
    return filtered;
}

module.exports = buildCatalog;
