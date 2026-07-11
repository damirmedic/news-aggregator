// HTML templates for the static site. Plain string templates, no framework —
// deliberately boring per CLAUDE.md. Mobile-first, minimal, fast-loading.

/** Escape text for safe insertion into HTML. */
export function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const CATEGORY_LABEL = { hr: 'Hrvatska', world: 'Svijet' };

function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // Stable, locale-independent output so regenerations diff cleanly.
  return d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
}

/** Render body text (plain text with blank-line paragraphs) into <p> blocks. */
function renderBody(body) {
  return String(body)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

/** One article card. `data-category` drives the client-side HR/World filter. */
export function articleCard(a) {
  const label = CATEGORY_LABEL[a.category] || a.category;
  const sub = a.subheadline ? `<p class="sub">${esc(a.subheadline)}</p>` : '';
  return `
<article class="item" data-category="${esc(a.category)}">
  <div class="meta">
    <span class="cat cat-${esc(a.category)}">${esc(label)}</span>
    <time datetime="${esc(a.publishedAt)}">${esc(formatDate(a.publishedAt))}</time>
  </div>
  <h2>${esc(a.headline)}</h2>
  ${sub}
  <div class="body">
${renderBody(a.body)}
  </div>
  <p class="source">Izvor: <a href="${esc(a.sourceUrl)}" rel="noopener noreferrer nofollow" target="_blank">${esc(a.sourceName)}</a></p>
</article>`;
}

/** Full page. `articles` already rendered to HTML string. */
export function pageShell({ itemsHtml, count, generatedAt }) {
  return `<!doctype html>
<html lang="hr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Sažeci vijesti bez clickbaita — činjenično, kratko, s izvorom.">
  <title>Vijesti — bez clickbaita</title>
  <link rel="stylesheet" href="./assets/styles.css">
</head>
<body>
  <header class="site-header">
    <h1>Vijesti — bez clickbaita</h1>
    <p class="tagline">Kratki, činjenični sažeci. Uvijek s poveznicom na izvor.</p>
    <nav class="filters" aria-label="Filter po kategoriji">
      <button type="button" class="active" data-filter="all">Sve</button>
      <button type="button" data-filter="hr">Hrvatska</button>
      <button type="button" data-filter="world">Svijet</button>
    </nav>
  </header>

  <main id="feed">
${itemsHtml || '<p class="empty">Još nema objavljenih sažetaka. Pokrenite <code>npm run ingest</code>.</p>'}
  </main>

  <footer class="site-footer">
    <p>${count} ${count === 1 ? 'objava' : 'objava'} · generirano ${esc(formatDate(generatedAt))}</p>
    <p>Sažeci su izvedeni iz činjenica; puni tekst i zasluge pripadaju izvoru.</p>
  </footer>

  <script>
    // Minimal client-side category filter — no dependencies.
    (function () {
      var buttons = document.querySelectorAll('.filters button');
      var items = document.querySelectorAll('#feed .item');
      buttons.forEach(function (btn) {
        btn.addEventListener('click', function () {
          var f = btn.getAttribute('data-filter');
          buttons.forEach(function (b) { b.classList.toggle('active', b === btn); });
          items.forEach(function (el) {
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
