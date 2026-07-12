// HTML templates for the static site — a plain, newspaper-style news portal.
// String templates only, no framework (deliberately boring per CLAUDE.md).
// Mobile-first, fast-loading, restrained typography. The front page shows a
// lead story + a grid of teasers; each headline links to a full detail page.

/** Escape text for safe insertion into HTML. */
export function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const CATEGORY_LABEL = { hrvatska: 'Hrvatska', zagreb: 'Zagreb', svijet: 'Svijet', sport: 'Sport' };

const HR_MONTHS = [
  'siječnja', 'veljače', 'ožujka', 'travnja', 'svibnja', 'lipnja',
  'srpnja', 'kolovoza', 'rujna', 'listopada', 'studenoga', 'prosinca',
];
const HR_WEEKDAYS = [
  'nedjelja', 'ponedjeljak', 'utorak', 'srijeda', 'četvrtak', 'petak', 'subota',
];

/** Long Croatian dateline, e.g. "subota, 11. srpnja 2026." (UTC-based). */
function croatianDateLong(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${HR_WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()}. ${HR_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}.`;
}

/** Short timestamp for cards/detail, e.g. "11.07.2026. 08:05". */
function formatDateTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}. ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
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

/** Shared <head>. depth=0 for the front page, 1 for pages under /article/. */
function head({ title, depth = 0 }) {
  const css = `${'../'.repeat(depth)}assets/styles.css`;
  return `<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Sažeci vijesti bez clickbaita — činjenično, kratko, s izvorom.">
  <title>${esc(title)}</title>
  <link rel="stylesheet" href="${esc(css)}">
</head>`;
}

/** The masthead. On the front page it carries the dateline + category filter. */
function masthead({ generatedAt, withFilter = false, homeHref = '#' }) {
  const home = withFilter
    ? '<h1>Vijesti — bez clickbaita</h1>'
    : `<h1><a href="${esc(homeHref)}">Vijesti — bez clickbaita</a></h1>`;
  const dateline = generatedAt
    ? `<p class="dateline">${esc(croatianDateLong(generatedAt))}</p>`
    : '';
  const nav = withFilter
    ? `<nav class="filters" aria-label="Filter po kategoriji">
      <button type="button" class="active" data-filter="all">Sve</button>
      <button type="button" data-filter="hrvatska">Hrvatska</button>
      <button type="button" data-filter="zagreb">Zagreb</button>
      <button type="button" data-filter="svijet">Svijet</button>
      <button type="button" data-filter="sport">Sport</button>
    </nav>`
    : `<p class="back"><a href="${esc(homeHref)}">← Sve vijesti</a></p>`;

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

/** The lead (hero) story on the front page — headline + short summary only. */
function leadStory(a) {
  const href = `article/${a.id}.html`;
  const sub = a.subheadline ? `<p class="deck">${esc(a.subheadline)}</p>` : '';
  return `
<article class="story lead" data-category="${esc(a.category)}">
  ${storyImage(a, { eager: true })}
  <div class="meta">${categoryChip(a.category)}<time datetime="${esc(a.publishedAt)}">${esc(formatDateTime(a.publishedAt))}</time></div>
  <h2><a href="${esc(href)}">${esc(a.headline)}</a></h2>
  ${sub}
  <p class="source">Izvor: <a href="${esc(a.sourceUrl)}" rel="noopener noreferrer nofollow" target="_blank">${esc(a.sourceName)}</a> · <a class="more" href="${esc(href)}">cijeli sažetak →</a></p>
</article>`;
}

/** A teaser card. `size` is 'featured' (the 2-up row) or 'grid' (3-up rows). */
function storyCard(a, { size = 'grid' } = {}) {
  const href = `article/${a.id}.html`;
  const sub = a.subheadline ? `<p class="deck">${esc(a.subheadline)}</p>` : '';
  return `
<article class="story card card-${size}" data-category="${esc(a.category)}">
  ${storyImage(a, { eager: size === 'featured' })}
  <div class="meta">${categoryChip(a.category)}<time datetime="${esc(a.publishedAt)}">${esc(formatDateTime(a.publishedAt))}</time></div>
  <h3><a href="${esc(href)}">${esc(a.headline)}</a></h3>
  ${sub}
  <p class="source">Izvor: <a href="${esc(a.sourceUrl)}" rel="noopener noreferrer nofollow" target="_blank">${esc(a.sourceName)}</a></p>
</article>`;
}

/**
 * Full front page. `articles` newest-first: 1 hero lead, then a 2-up
 * featured row, then the rest in a 3-up grid (desktop; fewer columns on
 * smaller screens — see .row-2 / .grid-3 in styles.css).
 */
export function frontPage({ articles, generatedAt }) {
  const [lead, ...rest] = articles;
  const row2 = rest.slice(0, 2);
  const gridRest = rest.slice(2);

  const sections = [
    lead ? leadStory(lead) : '',
    row2.length
      ? `<section class="row-2" aria-label="Istaknute vijesti">\n${row2.map((a) => storyCard(a, { size: 'featured' })).join('\n')}\n</section>`
      : '',
    gridRest.length
      ? `<section class="grid-3" aria-label="Najnovije vijesti">\n${gridRest.map((a) => storyCard(a, { size: 'grid' })).join('\n')}\n</section>`
      : '',
  ].filter(Boolean);

  const body = articles.length
    ? sections.join('\n')
    : '<p class="empty">Još nema objavljenih sažetaka. Pokrenite <code>npm run ingest</code>.</p>';

  return `<!doctype html>
<html lang="hr">
${head({ title: 'Vijesti — bez clickbaita' })}
<body>
  ${masthead({ generatedAt, withFilter: true })}
  <main id="feed">
    ${body}
  </main>
  ${siteFooter({ count: articles.length, generatedAt })}
  <script>
    // Minimal client-side category filter — no dependencies.
    (function () {
      var buttons = document.querySelectorAll('.filters button');
      var stories = document.querySelectorAll('#feed .story');
      buttons.forEach(function (btn) {
        btn.addEventListener('click', function () {
          var f = btn.getAttribute('data-filter');
          buttons.forEach(function (b) { b.classList.toggle('active', b === btn); });
          stories.forEach(function (el) {
            el.style.display = (f === 'all' || el.getAttribute('data-category') === f) ? '' : 'none';
          });
        });
      });
    })();
  </script>
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
  ${masthead({ generatedAt, withFilter: false, homeHref: '../index.html' })}
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
