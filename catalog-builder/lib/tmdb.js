// stremio/catalog-builder/lib/tmdb.js
const { httpsGetJson, retryWithBackoff } = require("./utils");
const TMDB_TOKEN = process.env.TMDB_TOKEN;
if (!TMDB_TOKEN) {
  throw new Error("TMDB_TOKEN environment variable not set");
}

const BASE_URL = "https://api.themoviedb.org/3";

/**
 * Perform a TMDB GET request.
 * Mirrors Ruby's tmdb_get implementation.
 */
async function tmdbGet(endpoint, params = {}) {
  if (global.metricsInstance) global.metricsInstance.incTmdbCalls();
  const url = new URL(`${BASE_URL}/${endpoint}`);

  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) {
      url.searchParams.set(k, v);
    }
  }

  // TMDB requires these headers:
  const headers = {
    accept: "application/json",
    Authorization: `Bearer ${TMDB_TOKEN}`
  };

  return retryWithBackoff(() => (
    httpsGetJson(url.toString(), headers)
  ));
}

/**
 * Fetch genre list for the selected language.
 * Ruby: tmdb_get("genre/movie/list?language=#{LANGUAGE}")
 */
function fetchGenres(language) {
  return tmdbGet("genre/movie/list", { language });
}

/**
 * Discover movies with filtering.
 * Ruby constructs `discover_url(page)`, we replicate with parameters.
 */
function discoverMovies(options, page) {
  return tmdbGet("discover/movie", {
    ...options,
    page
  });
}

/**
 * Get IMDB and other external IDs.
 * Ruby: tmdb_get("movie/#{id}/external_ids")
 */
function getExternalIds(movieId) {
  return tmdbGet(`movie/${movieId}/external_ids`);
}

/**
 * Get director + cast credits.
 * Ruby: tmdb_get("movie/#{id}/credits")
 */
function getCredits(movieId) {
  return tmdbGet(`movie/${movieId}/credits`);
}

/**
  * 
  *
  */
function getMovieBundle(movieId) {
  return tmdbGet(`movie/${movieId}`, {
    append_to_response: "external_ids,credits"
  });
}


module.exports = {
  fetchGenres,
  discoverMovies,
  getExternalIds,
  getCredits,
  getMovieBundle
};
