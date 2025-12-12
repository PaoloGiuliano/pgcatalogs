// stremio/catalog-builder/lib/scorer.js

/**
 * Compute final critic score from imdb (0–10), metascore (0–100), rt (0–100).
 * Mirrors the Ruby weighting logic.
 *
 * @param {number|null} imdbRaw
 * @param {number|null} metascore
 * @param {number|null} rt
 * @returns {number} score 0–100
 */
function computeFinalCriticScore(imdbRaw, metascore, rt) {
  const imdbScaled = imdbRaw ? imdbRaw * 10 : 0;

  if (metascore != null && rt != null) {
    return (imdbScaled * 0.5) + (metascore * 0.3) + (rt * 0.2);
  }
  if (metascore != null) {
    return (imdbScaled * 0.7) + (metascore * 0.3);
  }
  if (rt != null) {
    return (imdbScaled * 0.7) + (rt * 0.3);
  }
  if (imdbRaw != null) {
    return imdbScaled;
  }
  return 0;
}

module.exports = {
  computeFinalCriticScore
};
