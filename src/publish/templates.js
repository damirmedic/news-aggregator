// HTML templates for the static site — a plain, newspaper-style news portal.
// String templates only, no framework (deliberately boring per CLAUDE.md).
// Mobile-first, fast-loading, restrained typography.
//
// Layout model (see styles.css .story-grid): every grid renders its first row
// as 2 cards and every following row as 3 (desktop). There's no "hero" card —
// the same rule applies on the homepage sections and on each category page, so
// a category view looks the same as a homepage section. Navigation is plain
// links to real pages (no client-side filtering), so the whole site works
// without JavaScript.

/** Escape text for safe insertion into HTML. */
export function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Site name — used in the masthead h1 and in every page <title>.
const SITE_NAME = 'Normalne vijesti';
// Masthead subtitle under the h1 — a plain descriptor of what this site is.
const SITE_SUBTITLE = 'Test projekt za učenje i privatnu uporabu';

// Category display order + labels. This is the single source of truth for
// which categories get a homepage section, a nav item, and a /category page.
export const CATEGORIES = ['hrvatska', 'zagreb', 'svijet', 'sport'];
export const CATEGORY_LABEL = { hrvatska: 'Hrvatska', zagreb: 'Zagreb', svijet: 'Svijet', sport: 'Sport' };

// How many articles each homepage section shows (1 row of 2 + 2 rows of 3).
const SECTION_SIZE = 8;

// Category-page infinite reveal: show this many at load, then this many more
// each time the reader scrolls near the bottom (see categoryFeed / catFeedScript).
const CAT_INITIAL = 11;
const CAT_BATCH = 9;

const HR_MONTHS = [
  'siječnja', 'veljače', 'ožujka', 'travnja', 'svibnja', 'lipnja',
  'srpnja', 'kolovoza', 'rujna', 'listopada', 'studenoga', 'prosinca',
];
const HR_WEEKDAYS = [
  'nedjelja', 'ponedjeljak', 'utorak', 'srijeda', 'četvrtak', 'petak', 'subota',
];

const ZAGREB_TZ = 'Europe/Zagreb';

// hourCycle: 'h23' (not hour12: false) avoids a well-known Intl quirk where
// midnight can render as "24" instead of "00" in some engines.
const ZAGREB_PARTS_FMT = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZAGREB_TZ,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/**
 * Y/M/D/H/Min of `d` in Croatia's local time — CET (UTC+1) or CEST (UTC+2)
 * depending on the date, resolved automatically via the IANA tz database
 * rather than a hardcoded offset (which would be wrong for half the year).
 */
function zagrebParts(d) {
  const p = Object.fromEntries(ZAGREB_PARTS_FMT.formatToParts(d).map((x) => [x.type, x.value]));
  return {
    year: Number(p.year), month: Number(p.month), day: Number(p.day),
    hour: Number(p.hour), minute: Number(p.minute),
  };
}

/** Long Croatian dateline, e.g. "subota, 11. srpnja 2026." (Europe/Zagreb local time). */
function croatianDateLong(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const { year, month, day } = zagrebParts(d);
  // Weekday only depends on the calendar date, so anchoring at UTC midnight
  // for this lookup is safe once year/month/day are already Zagreb-local.
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return `${HR_WEEKDAYS[weekday]}, ${day}. ${HR_MONTHS[month - 1]} ${year}.`;
}

/** Short timestamp for cards/detail, e.g. "11.07.2026. 08:05" (Europe/Zagreb local time). */
function formatDateTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const { year, month, day, hour, minute } = zagrebParts(d);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(day)}.${p(month)}.${year}. ${p(hour)}:${p(minute)}`;
}

/** Zagreb-local calendar day as "YYYY-MM-DD" — the grouping key for date separators. */
function zagrebDateKey(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const { year, month, day } = zagrebParts(d);
  const p = (n) => String(n).padStart(2, '0');
  return `${year}-${p(month)}-${p(day)}`;
}

// Longest the handleized-title part of an article slug may get; the slug is cut
// on a word boundary at this length so URLs stay short and readable. The publish
// date (always ~11 chars) is appended after this, so total stays well bounded.
const SLUG_MAX_CHARS = 60;

/**
 * URL-safe slug of a string: transliterate Croatian diacritics (š→s, č/ć→c,
 * ž→z, đ→d), lowercase, collapse every run of non-alphanumerics to a single
 * hyphen, trim. "Prešao iz Aston Ville" → "presao-iz-aston-ville".
 */
function slugify(text) {
  return String(text ?? '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip combining marks (š/č/ž/ć)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Truncate a hyphenated slug to `max` chars on a word (hyphen) boundary. Only
 * when it actually truncates does it also drop a severed trailing bare number
 * or 1–2 letter connector ("...chelsea-za-117" → "...chelsea") — an untruncated
 * slug is left exactly as-is, so a title ending in a score ("rezultat-2-1")
 * keeps its digits.
 */
function truncateOnWord(slug, max) {
  if (slug.length <= max) return slug;
  const cut = slug.slice(0, max);
  const lastHyphen = cut.lastIndexOf('-');
  let out = lastHyphen > 0 ? cut.slice(0, lastHyphen) : cut;
  let prev;
  do { prev = out; out = out.replace(/-(?:\d+|[a-z]{1,2})$/, ''); } while (out !== prev);
  return out.replace(/-+$/, '');
}

/**
 * Base article URL slug: handleized headline + Zagreb-local publish date, e.g.
 * "morgan-rogers-presao-iz-aston-ville-u-chelsea-2026-07-22". Deterministic;
 * ensuring it's unique across a build is the caller's job (generate.js).
 */
export function articleSlug(headline, publishedAtIso) {
  const title = truncateOnWord(slugify(headline), SLUG_MAX_CHARS) || 'clanak';
  const date = zagrebDateKey(publishedAtIso);
  return date ? `${title}-${date}` : title;
}

/** Split plain body text (blank-line paragraphs) into an array of paragraphs. */
function paragraphs(body) {
  return String(body)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Render body paragraphs to <p> blocks. */
function renderBody(body) {
  return paragraphs(body)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

/** Relative path prefix from a page at the given depth back to public/ root. */
function prefixFor(depth) {
  return '../'.repeat(depth);
}

/** Shared <head>. depth=0 for the front page, 1 for pages one level down. */
function head({ title, depth = 0 }) {
  const css = `${prefixFor(depth)}assets/styles.css`;
  return `<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Sažeci vijesti bez clickbaita — činjenično, kratko, s izvorom.">
  <meta name="robots" content="noindex, nofollow, noarchive, nosnippet, noimageindex">
  <title>${esc(title)}</title>
  <link rel="stylesheet" href="${esc(css)}">
</head>`;
}

/**
 * The masthead with its category navigation. `active` is the key of the
 * currently-open view ('all' for the homepage, a category key on a category
 * page, or null on the article page). Nav items are plain links resolved
 * relative to `depth`.
 */
function masthead({ generatedAt, active = 'all', depth = 0 }) {
  const prefix = prefixFor(depth);
  const homeHref = `${prefix}index.html`;
  const home = active === 'all'
    ? `<h1>${esc(SITE_NAME)}</h1>`
    : `<h1><a href="${esc(homeHref)}">${esc(SITE_NAME)}</a></h1>`;
  const dateline = generatedAt
    ? `<p class="dateline">${esc(croatianDateLong(generatedAt))}</p>`
    : '';

  const navItems = [
    { key: 'all', label: 'Najnovije', href: homeHref },
    ...CATEGORIES.map((key) => ({ key, label: CATEGORY_LABEL[key], href: `${prefix}category/${key}.html` })),
  ];
  // The category bar is rendered as a SIBLING of <header>, not a child — a
  // position:sticky element only stays pinned while its containing block is on
  // screen, so nesting it in the (short, scroll-away) header would unstick it
  // almost immediately. As a top-level block its containing block is the whole
  // page, so it stays pinned to the top as you scroll.
  const categoryBar = `<nav class="category-bar" aria-label="Kategorije">
    <div class="category-bar-inner">
      ${navItems
        .map((it) => `<a href="${esc(it.href)}"${active === it.key ? ' class="active" aria-current="page"' : ''}>${esc(it.label)}</a>`)
        .join('\n      ')}
    </div>
  </nav>`;

  return `<header class="site-header">
    <div class="masthead">
      ${home}
      ${dateline}
      <p class="site-subtitle">${esc(SITE_SUBTITLE)}</p>
    </div>
  </header>
  ${categoryBar}`;
}

function categoryChip(category) {
  const label = CATEGORY_LABEL[category] || category;
  return `<span class="cat cat-${esc(category)}">${esc(label)}</span>`;
}

/**
 * Illustrative featured image. Never the source's own photo: it's either a
 * royalty-free Pexels photo (hotlinked from Pexels' CDN, credited to the
 * photographer + Pexels) or a self-hosted per-category placeholder (credit
 * null -> labelled "Ilustracija", since it's decorative, not a photo of the
 * event). See pipeline/resolveImage.js and CLAUDE.md's image caveat.
 */
function storyImage(a, { eager = false } = {}) {
  if (!a.imageUrl) return '';
  const caption = a.imageCredit
    ? `Foto: <a href="${esc(a.imageCreditUrl || 'https://www.pexels.com')}" rel="noopener noreferrer nofollow" target="_blank">${esc(a.imageCredit)}</a> / <a href="https://www.pexels.com" rel="noopener noreferrer nofollow" target="_blank">Pexels</a>`
    : 'Ilustracija';
  // The figure carries a pulsing grey skeleton background (CSS); the image sits
  // on top and covers it once loaded. `onload` marks the figure loaded to stop
  // the animation; `onerror` removes the whole figure (no broken-image box).
  return `<figure class="story-image">
    <img src="${esc(a.imageUrl)}" alt="${esc(a.headline)}" loading="${eager ? 'eager' : 'lazy'}" referrerpolicy="no-referrer" onload="this.closest('figure').classList.add('is-loaded')" onerror="this.closest('figure').remove()">
    <figcaption>${caption}</figcaption>
  </figure>`;
}

/**
 * A story card. `prefix` resolves the detail-page link relative to the page
 * the card is on. On category pages the extra args wire up infinite scroll:
 * `idx` is the card's global position, `pending` hides it until revealed (only
 * takes visual effect once JS marks the page — see the category feed script).
 */
function storyCard(a, { eager = false, prefix = '', idx = null, pending = false } = {}) {
  const href = `${prefix}article/${a.slug}`;
  const sub = a.subheadline ? `<p class="deck">${esc(a.subheadline)}</p>` : '';
  const attrs = [
    `class="story${pending ? ' pending' : ''}"`,
    `data-category="${esc(a.category)}"`,
    idx !== null ? `data-idx="${idx}"` : '',
  ].filter(Boolean).join(' ');
  return `
<article ${attrs}>
  ${storyImage(a, { eager })}
  <div class="meta">${categoryChip(a.category)}<time datetime="${esc(a.publishedAt)}">${esc(formatDateTime(a.publishedAt))}</time></div>
  <h3><a href="${esc(href)}">${esc(a.headline)}</a></h3>
  ${sub}
  <p class="source">Izvor: <a href="${esc(a.sourceUrl)}" rel="noopener noreferrer nofollow" target="_blank">${esc(a.sourceName)}</a></p>
</article>`;
}

/** A grid of story cards. `eagerCount` cards load their image eagerly. */
function storyGrid(articles, { eagerCount = 0, prefix = '' } = {}) {
  return `<div class="story-grid">\n${articles
    .map((a, i) => storyCard(a, { eager: i < eagerCount, prefix }))
    .join('\n')}\n</div>`;
}

/**
 * A homepage section: a titled block of up to SECTION_SIZE cards, optionally
 * followed by a "read all" link to the full category page.
 */
function homeSection({ title, articles, readAll, eagerCount = 0 }) {
  const more = readAll
    ? `\n  <p class="section-more"><a href="${esc(readAll.href)}">${esc(readAll.label)} →</a></p>`
    : '';
  return `<section class="feed-section">
  <h2 class="section-title">${esc(title)}</h2>
  ${storyGrid(articles, { eagerCount, prefix: '' })}${more}
</section>`;
}

/**
 * Front page. Newest-first `articles`, split into a mixed "Najnovije" strip
 * plus one section per category that has articles. Each category section links
 * to its full /category page.
 */
export function frontPage({ articles, generatedAt }) {
  let main;
  if (!articles.length) {
    main = '<p class="empty">Još nema objavljenih sažetaka. Pokrenite <code>npm run ingest</code>.</p>';
  } else {
    const sections = [
      homeSection({
        title: 'Najnovije',
        articles: articles.slice(0, SECTION_SIZE),
        eagerCount: 3,
      }),
    ];
    for (const key of CATEGORIES) {
      const inCat = articles.filter((a) => a.category === key).slice(0, SECTION_SIZE);
      if (!inCat.length) continue;
      sections.push(
        homeSection({
          title: CATEGORY_LABEL[key],
          articles: inCat,
          readAll: { href: `category/${key}.html`, label: `Pročitaj sve vijesti u kategoriji ${CATEGORY_LABEL[key]}` },
        })
      );
    }
    main = sections.join('\n');
  }

  return `<!doctype html>
<html lang="hr">
${head({ title: SITE_NAME })}
<body>
  ${masthead({ generatedAt, active: 'all', depth: 0 })}
  <main>
    ${main}
  </main>
  ${siteFooter({ count: articles.length, generatedAt })}
</body>
</html>
`;
}

/**
 * Category feed: all articles newest-first, uniform responsive grid, with a
 * full-width date separator inserted wherever the Zagreb-local day changes.
 * Each card carries a global `data-idx`; cards past `CAT_INITIAL` are marked
 * `pending` (revealed on scroll by catFeedScript). A date separator records the
 * index of its first card so it can be revealed together with it. With no
 * JavaScript, nothing is hidden — the whole list renders.
 */
function categoryFeed(articles, { prefix }) {
  const parts = [];
  let dayKey = null;
  let idx = 0;
  for (const a of articles) {
    const dk = zagrebDateKey(a.publishedAt);
    if (dk !== dayKey) {
      dayKey = dk;
      const pending = idx >= CAT_INITIAL ? ' pending' : '';
      parts.push(`<div class="date-sep${pending}" data-first-idx="${idx}">${esc(croatianDateLong(a.publishedAt))}</div>`);
    }
    parts.push(storyCard(a, { eager: idx < 3, prefix, idx, pending: idx >= CAT_INITIAL }));
    idx++;
  }
  return `<div class="cat-feed" data-initial="${CAT_INITIAL}" data-batch="${CAT_BATCH}">
${parts.join('\n')}
<div class="cat-sentinel" aria-hidden="true"></div>
</div>`;
}

/**
 * Client script for the category feed: progressively reveals `pending` cards
 * (and their date separators) in batches as the reader nears the bottom,
 * flashing grey skeleton cards during the brief load. Pure DOM, no fetching —
 * every card is already server-rendered; this only toggles visibility.
 */
function catFeedScript() {
  return `<script>
(function () {
  var feed = document.querySelector('.cat-feed');
  if (!feed || !('IntersectionObserver' in window)) return;
  document.documentElement.classList.add('has-js');
  var batch = +feed.dataset.batch || 9;
  var cards = [].slice.call(feed.querySelectorAll('.story'));
  var seps = [].slice.call(feed.querySelectorAll('.date-sep'));
  var sentinel = feed.querySelector('.cat-sentinel');
  var total = cards.length;
  var limit = +feed.dataset.initial || 11;
  var loading = false;

  function apply() {
    cards.forEach(function (c) { c.classList.toggle('pending', +c.dataset.idx >= limit); });
    seps.forEach(function (s) { s.classList.toggle('pending', +s.dataset.firstIdx >= limit); });
  }
  function done() { return limit >= total; }
  function skeleton() {
    var d = document.createElement('div');
    d.className = 'skeleton-card';
    d.setAttribute('aria-hidden', 'true');
    d.innerHTML = '<div class="sk sk-img"></div><div class="sk sk-line"></div><div class="sk sk-line short"></div>';
    return d;
  }
  apply();
  if (done()) { sentinel.remove(); return; }

  var io = new IntersectionObserver(function (entries) {
    if (!entries[0].isIntersecting || loading || done()) return;
    loading = true;
    var n = Math.min(batch, total - limit);
    var skels = [];
    for (var i = 0; i < n; i++) { var s = skeleton(); feed.insertBefore(s, sentinel); skels.push(s); }
    setTimeout(function () {
      skels.forEach(function (s) { s.remove(); });
      limit += batch;
      apply();
      loading = false;
      if (done()) io.disconnect();
    }, 550);
  }, { rootMargin: '400px 0px' });
  io.observe(sentinel);
})();
</script>`;
}

/**
 * A full category page. Lives at public/category/{key}.html (depth 1), so links
 * back up use a "../" prefix. The article list infinite-scrolls (see
 * categoryFeed / catFeedScript) and shows date separators.
 */
export function categoryPage({ categoryKey, articles, generatedAt }) {
  const label = CATEGORY_LABEL[categoryKey] || categoryKey;
  const body = articles.length
    ? categoryFeed(articles, { prefix: '../' })
    : '<p class="empty">Trenutačno nema vijesti u ovoj kategoriji.</p>';

  return `<!doctype html>
<html lang="hr">
${head({ title: `${label} — ${SITE_NAME}`, depth: 1 })}
<body>
  <script>document.documentElement.className += ' has-js';</script>
  ${masthead({ generatedAt, active: categoryKey, depth: 1 })}
  <main>
    <section class="feed-section">
      <h2 class="section-title">${esc(label)}</h2>
      ${body}
    </section>
  </main>
  ${siteFooter({ count: articles.length, generatedAt })}
  ${articles.length ? catFeedScript() : ''}
</body>
</html>
`;
}

/** Full article detail page. */
export function articlePage({ article: a, generatedAt }) {
  return `<!doctype html>
<html lang="hr">
${head({ title: `${a.headline} — ${SITE_NAME}`, depth: 1 })}
<body>
  ${masthead({ generatedAt, active: null, depth: 1 })}
  <main class="article-page">
    <article class="story full" data-category="${esc(a.category)}">
      ${storyImage(a, { eager: true })}
      <div class="meta">${categoryChip(a.category)}<time datetime="${esc(a.publishedAt)}">${esc(formatDateTime(a.publishedAt))}</time></div>
      <h2>${esc(a.headline)}</h2>
      ${a.subheadline ? `<p class="deck">${esc(a.subheadline)}</p>` : ''}
      <div class="body">
${renderBody(a.body)}
      </div>
      <p class="source">Izvor: <a href="${esc(a.sourceUrl)}" rel="noopener noreferrer nofollow" target="_blank">${esc(a.sourceName)}</a></p>
      <p class="disclaimer">Ovo je činjenični sažetak izveden iz izvornog članka. Puni tekst i zasluge pripadaju izvoru; kliknite poveznicu iznad.</p>
    </article>
  </main>
  ${siteFooter({ generatedAt })}
</body>
</html>
`;
}

function siteFooter({ count, generatedAt }) {
  const countLine = typeof count === 'number' ? `<p>${count} objava · generirano ${esc(formatDateTime(generatedAt))}</p>` : '';
  return `<footer class="site-footer">
    ${countLine}
    <p>Sažeci su izvedeni iz činjenica; puni tekst i zasluge pripadaju izvoru.</p>
  </footer>`;
}
