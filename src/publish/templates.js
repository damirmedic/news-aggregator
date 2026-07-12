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

// Category display order + labels. This is the single source of truth for
// which categories get a homepage section, a nav item, and a /category page.
export const CATEGORIES = ['hrvatska', 'zagreb', 'svijet', 'sport'];
export const CATEGORY_LABEL = { hrvatska: 'Hrvatska', zagreb: 'Zagreb', svijet: 'Svijet', sport: 'Sport' };

// How many articles each homepage section shows (1 row of 2 + 2 rows of 3).
const SECTION_SIZE = 8;

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
    ? '<h1>Vijesti — bez clickbaita</h1>'
    : `<h1><a href="${esc(homeHref)}">Vijesti — bez clickbaita</a></h1>`;
  const dateline = generatedAt
    ? `<p class="dateline">${esc(croatianDateLong(generatedAt))}</p>`
    : '';

  const navItems = [
    { key: 'all', label: 'Sve', href: homeHref },
    ...CATEGORIES.map((key) => ({ key, label: CATEGORY_LABEL[key], href: `${prefix}category/${key}.html` })),
  ];
  const nav = `<nav class="filters" aria-label="Kategorije">
      ${navItems
        .map((it) => `<a href="${esc(it.href)}"${active === it.key ? ' class="active" aria-current="page"' : ''}>${esc(it.label)}</a>`)
        .join('\n      ')}
    </nav>`;

  return `<header class="site-header">
    <div class="masthead">
      ${home}
      ${dateline}
    </div>
    <p class="tagline">Kratki, činjenični sažeci. Uvijek s poveznicom na izvor.</p>
    ${nav}
  </header>`;
}

function categoryChip(category) {
  const label = CATEGORY_LABEL[category] || category;
  return `<span class="cat cat-${esc(category)}">${esc(label)}</span>`;
}

/**
 * Hotlinked featured image with a visible source credit — never downloaded
 * or rehosted, always attributed. See the CLAUDE.md caveat this deliberately
 * carves out from the "headline + quote only" principle.
 */
function storyImage(a, { eager = false } = {}) {
  if (!a.imageUrl) return '';
  return `<figure class="story-image">
    <img src="${esc(a.imageUrl)}" alt="${esc(a.headline)}" loading="${eager ? 'eager' : 'lazy'}" referrerpolicy="no-referrer" onerror="this.closest('figure').remove()">
    <figcaption>Foto: ${esc(a.sourceName)}</figcaption>
  </figure>`;
}

/**
 * A story card. Uniform everywhere — the grid, not the card, decides sizing
 * (first row 2-up, then 3-up). `prefix` resolves the detail-page link relative
 * to the page the card is rendered on (homepage vs. /category).
 */
function storyCard(a, { eager = false, prefix = '' } = {}) {
  const href = `${prefix}article/${a.id}.html`;
  const sub = a.subheadline ? `<p class="deck">${esc(a.subheadline)}</p>` : '';
  return `
<article class="story" data-category="${esc(a.category)}">
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
${head({ title: 'Vijesti — bez clickbaita' })}
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
 * A full category page: every article in one category, newest-first, in the
 * same 2-then-3 grid used everywhere else. Lives at public/category/{key}.html
 * (depth 1), so links back up use a "../" prefix.
 */
export function categoryPage({ categoryKey, articles, generatedAt }) {
  const label = CATEGORY_LABEL[categoryKey] || categoryKey;
  const body = articles.length
    ? storyGrid(articles, { eagerCount: 3, prefix: '../' })
    : '<p class="empty">Trenutačno nema vijesti u ovoj kategoriji.</p>';

  return `<!doctype html>
<html lang="hr">
${head({ title: `${label} — Vijesti`, depth: 1 })}
<body>
  ${masthead({ generatedAt, active: categoryKey, depth: 1 })}
  <main>
    <section class="feed-section">
      <h2 class="section-title">${esc(label)}</h2>
      ${body}
    </section>
  </main>
  ${siteFooter({ count: articles.length, generatedAt })}
</body>
</html>
`;
}

/** Full article detail page. */
export function articlePage({ article: a, generatedAt }) {
  return `<!doctype html>
<html lang="hr">
${head({ title: `${a.headline} — Vijesti`, depth: 1 })}
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
