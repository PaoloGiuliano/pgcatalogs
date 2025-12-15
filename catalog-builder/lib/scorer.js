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
  let imdbScaled = imdbRaw ? imdbRaw * 10 : 0;

  if (metascore != null && rt != null) {
    return imdbScaled * 0.5 + metascore * 0.3 + rt * 0.2;
  }
  if (metascore != null) {
    let criticScore = imdbScaled * 0.7 + metascore * 0.3;
    if (criticScore >= 20) criticScore -= 20;
    return criticScore;
  }
  if (rt != null) {
    let criticScore = imdbScaled * 0.7 + rt * 0.3;
    if (criticScore >= 20) criticScore -= 20;
    return criticScore;
  }
  if (imdbRaw != null) {
    if (imdbScaled >= 30) imdbScaled -= 30;
    return imdbScaled;
  }
  return 0;
}

module.exports = {
  computeFinalCriticScore,
};
