// Step 2: scope / junk filter. Pure functions (no I/O) so they're trivially
// unit-testable. The pipeline calls shouldDrop() on each new raw_item and, per
// CLAUDE.md, drops out-of-scope content automatically rather than queuing it.
//
// This starter exclude list matches on the URL path and the title. It's meant
// to grow per-source as we learn each feed's junk categories — add patterns
// here (or wire a source-specific map later).

// Patterns tested against the lowercased URL pathname.
const URL_PATTERNS = [
  /\/horoskop/,
  /\/galerij/, // galerija / galerije
  /\/video(\/|$|-)/,
  /\/sponzorirano/,
  /\/promo(\/|-)/,
  /\/native/,
  /\/kolumn/, // kolumna / kolumne (opinion)
  /\/uzivo(\/|$|-)/, // "uživo" live-tickers (diacritic-stripped, see normalize)
  /\/live(\/|$|-)/,
  /\/nagradna-igra/,
  /\/oglas/,
];

// Patterns tested against the lowercased, diacritic-stripped title.
const TITLE_PATTERNS = [
  { re: /\bhoroskop\b/, reason: 'horoscope' },
  { re: /\bfoto\b|\bgalerija\b|\bpogledajte fotografije\b/, reason: 'gallery' },
  { re: /\bvideo\b|\bpogledajte snimku\b/, reason: 'video-only' },
  { re: /\bsponzorirano\b|\bplaceni\b|\bpromo\b/, reason: 'sponsored' },
  { re: /\buzivo\b|\blive\b/, reason: 'live-ticker' },
  { re: /\bnagradna igra\b/, reason: 'contest' },
];

const URL_REASON = 'excluded-url-pattern';

/** Lowercase + strip Croatian diacritics so patterns match uniformly. */
export function normalize(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritical marks
    .replace(/đ/g, 'd'); // NFD leaves đ/Đ intact; handle explicitly
}

/**
 * Decide whether a feed item is out of scope.
 * @returns {{ drop: boolean, reason: string|null }}
 */
export function shouldDrop({ title, link }) {
  let path = '';
  try {
    path = new URL(link).pathname;
  } catch {
    // A malformed link is itself a reason to drop.
    return { drop: true, reason: 'invalid-url' };
  }

  const normPath = normalize(path);
  if (URL_PATTERNS.some((re) => re.test(normPath))) {
    return { drop: true, reason: URL_REASON };
  }

  const normTitle = normalize(title);
  for (const { re, reason } of TITLE_PATTERNS) {
    if (re.test(normTitle)) return { drop: true, reason };
  }

  return { drop: false, reason: null };
}
