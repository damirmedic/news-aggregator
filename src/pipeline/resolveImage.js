// Pick an illustrative featured image for an article WITHOUT ever touching the
// source's own copyrighted photo. Two steps, in order:
//
//   1. Royalty-free topic match from Pexels (free stock, one uniform permissive
//      license), searched with a short English theme query the summary step
//      produced. The image is hotlinked from Pexels' CDN — never downloaded or
//      rehosted — and credited to the photographer + Pexels per their API
//      guidelines.
//   2. Fallback: a self-hosted, per-category placeholder SVG
//      (assets/placeholders/{category}.svg) — dependency-free and always
//      available, used when there's no key, no query match, or a network error.
//
// This deliberately REPLACES the old source-og:image hotlinking (removed): a
// generic thematic stock photo is clearly illustrative rather than purporting
// to document the event, which is both the legally-safe and the honest choice.
// See CLAUDE.md's image caveat.
import { config } from '../config.js';

// The site's display categories (kept in sync with publish/templates.js
// CATEGORIES, which is the single source of truth). Any unknown/again-unseen
// value maps to the domestic default so a placeholder always exists.
const PLACEHOLDER_CATEGORIES = new Set(['hrvatska', 'zagreb', 'svijet', 'sport']);

// English theme query used when the summary step didn't supply an imageQuery
// (e.g. stub mode, or an older row) — keeps queryless articles thematic rather
// than dropping straight to the flat placeholder.
const CATEGORY_QUERY = {
  hrvatska: 'Croatia landscape',
  zagreb: 'Zagreb Croatia city',
  svijet: 'world map globe',
  sport: 'stadium sport',
};

/** Root-relative placeholder for a category. Credit is null (it's not a photo). */
export function placeholderFor(category) {
  const cat = PLACEHOLDER_CATEGORIES.has(category) ? category : 'hrvatska';
  return { imageUrl: `/assets/placeholders/${cat}.svg`, imageCredit: null, imageCreditUrl: null };
}

/**
 * Query Pexels for one landscape photo matching `query`. Returns the chosen
 * image + attribution, or null on any miss (no key, empty query, no result,
 * non-200, timeout, malformed JSON) so the caller falls back to a placeholder.
 */
async function searchPexels(query, fetchImpl) {
  const key = config.images.pexelsApiKey;
  if (!key || !query) return null;

  const url =
    'https://api.pexels.com/v1/search' +
    `?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.images.fetchTimeoutMs);
  try {
    const res = await fetchImpl(url, {
      headers: { Authorization: key },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const photo = data?.photos?.[0];
    const src = photo?.src?.landscape || photo?.src?.large || photo?.src?.original;
    if (!src) return null;
    return {
      imageUrl: src,
      imageCredit: photo.photographer || 'Pexels',
      // The photo's own Pexels page — the link Pexels' guidelines ask us to
      // attribute back to.
      imageCreditUrl: photo.url || photo.photographer_url || 'https://www.pexels.com',
    };
  } catch {
    return null; // aborted/timed-out/network — placeholder is fine
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolve the featured image for one article.
 * @param opts.query    short English theme query from the summary step
 * @param opts.category the article's display category
 * @param opts.offline  skip the network entirely (fixtures/tests) -> placeholder
 * @param opts.fetchImpl injectable fetch (defaults to global fetch)
 * @returns {Promise<{ imageUrl: string, imageCredit: string|null, imageCreditUrl: string|null }>}
 */
export async function resolveArticleImage(
  { query, category, offline = false },
  { fetchImpl = fetch } = {}
) {
  if (offline) return placeholderFor(category);
  const q = (query || '').trim() || CATEGORY_QUERY[category] || '';
  const hit = await searchPexels(q, fetchImpl);
  return hit || placeholderFor(category);
}
