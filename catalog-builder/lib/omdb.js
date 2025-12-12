// stremio/catalog-builder/lib/omdb.js
const { httpsGetJson, retryWithBackoff } = require("./utils");

/**
 * Extract Rotten Tomatoes rating from OMDB response.
 */
function extractRotten(data) {
  const arr = data && data.Ratings;
  if (!Array.isArray(arr)) return null;
  const rt = arr.find((r) => r.Source === "Rotten Tomatoes");
  if (!rt || typeof rt.Value !== "string") return null;
  const value = parseInt(rt.Value.replace("%", ""), 10);
  return Number.isNaN(value) ? null : value;
}

/**
 * Fetch raw OMDB data for an IMDB ID.
 */
async function fetchOmdbRating(imdbId, apiKey) {
  if (!apiKey) {
    // If OMDB_API_KEY is missing, we return an empty object and let caller handle it.
    return {};
  }

  const url = `https://www.omdbapi.com/?i=${encodeURIComponent(
    imdbId
  )}&apikey=${encodeURIComponent(apiKey)}`;

  return httpsGetJson(url);
}

/**
 * Get rating from cache or OMDB (with retries).
 * Mirrors the Ruby logic: uses cache if present and not completely empty.
 *
 * @param {number|string} tmdbId
 * @param {string} imdbId
 * @param {object} ratingsCache
 * @param {string} apiKey
 * @returns {Promise<object>}
 */
async function getRating(tmdbId, imdbId, ratingsCache, apiKey) {
  // Determine stable key
  const key = imdbId ? imdbId : `tmdb:${tmdbId}`;

  // Check cache
  if (ratingsCache[key]) {
    const c = ratingsCache[key];
    const allEmpty =
      (c.imdb == null) &&
      (c.metascore == null) &&
      (c.rt == null);

    if (!allEmpty) {
      // Log that it was a cache hit //
      console.log(`OMDB cache hit: ${key}`);
      if (global.metricsInstance) global.metricsInstance.incOmdbHit();
      return c;
    }
  }

  // If no IMDb ID → cannot fetch OMDB
  if (!imdbId || !apiKey) {
    const rating = {
      imdb_id: imdbId || null,
      imdb: null,
      metascore: null,
      rt: null,
      fetched_at: new Date().toISOString()
    };
    ratingsCache[key] = rating;
    return rating;
  }

  // Log if it was a fetch //
  console.log(`OMDB fetch: ${key}`);
  if (global.metricsInstance) global.metricsInstance.incOmdbFetch();
  
  // Fetch from OMDB
  let data;
  try {
    data = await retryWithBackoff(() =>
      fetchOmdbRating(imdbId, apiKey)
    );
  } catch (e) {
    console.log(`OMDB error for ${imdbId}: ${e.message}`);
    data = {};
  }

  const metaRaw = data.Metascore;
  const imdbRaw = data.imdbRating;
  const rt = extractRotten(data);

  const imdb = imdbRaw === "N/A" || imdbRaw == null ? null : parseFloat(imdbRaw);
  const metascore = metaRaw === "N/A" || metaRaw == null ? null : parseInt(metaRaw, 10);

  const rating = {
    imdb_id: imdbId,
    metascore: Number.isNaN(metascore) ? null : metascore,
    imdb: Number.isNaN(imdb) ? null : imdb,
    rt: rt,
    fetched_at: new Date().toISOString()
  };

  ratingsCache[key] = rating;
  return rating;
}

module.exports = {
  getRating
};
