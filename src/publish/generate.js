// Step 7: regenerate the static site from the DB. Writes public/index.html, one
// public/article/{slug}.html detail page per article, and the stylesheet.
// Called at the end of every ingestion cycle.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { getPublishedArticles } from '../db/queries.js';
import { frontPage, articlePage, categoryPage, CATEGORIES, articleSlug } from './templates.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STYLES_SRC = path.resolve(__dirname, 'assets/styles.css');
const PLACEHOLDERS_SRC = path.resolve(__dirname, 'assets/placeholders');

/**
 * Render the whole static site.
 * @returns {{ count: number, outPath: string }}
 */
export function generateSite() {
  const retentionMs = config.freshness.articleRetentionDays * 24 * 60 * 60 * 1000;
  const sinceIso = new Date(Date.now() - retentionMs).toISOString();
  const articles = getPublishedArticles({ sinceIso });
  assignSlugs(articles);
  const generatedAt = new Date().toISOString();

  const outDir = config.paths.publicDir;
  const assetsDir = path.join(outDir, 'assets');
  const articleDir = path.join(outDir, 'article');
  const categoryDir = path.join(outDir, 'category');

  // Rebuild the article/ + category/ trees from scratch so deleted articles
  // (and emptied categories) leave no orphaned pages behind.
  fs.rmSync(articleDir, { recursive: true, force: true });
  fs.rmSync(categoryDir, { recursive: true, force: true });
  fs.mkdirSync(assetsDir, { recursive: true });
  fs.mkdirSync(articleDir, { recursive: true });
  fs.mkdirSync(categoryDir, { recursive: true });

  // Copy the stylesheet + self-hosted category placeholder images so public/
  // is self-contained (placeholders back every article that has no stock photo).
  fs.copyFileSync(STYLES_SRC, path.join(assetsDir, 'styles.css'));
  fs.cpSync(PLACEHOLDERS_SRC, path.join(assetsDir, 'placeholders'), { recursive: true });

  // Keep the whole site out of search engines. Three overlapping layers, since
  // no single one is airtight on its own:
  //   1. robots.txt — asks compliant crawlers not to fetch anything.
  //   2. _headers (Cloudflare Pages) — sends X-Robots-Tag on every response,
  //      the strongest signal because it doesn't rely on the crawler parsing
  //      HTML, and it still reaches a page linked from elsewhere.
  //   3. <meta name="robots" ...> in every <head> (see templates.js:head).
  // This is a private, personal-use trial site — it should never appear in
  // search results (see CLAUDE.md image/legal caveat).
  fs.writeFileSync(
    path.join(outDir, 'robots.txt'),
    'User-agent: *\nDisallow: /\n',
    'utf8'
  );
  fs.writeFileSync(
    path.join(outDir, '_headers'),
    '/*\n  X-Robots-Tag: noindex, nofollow, noarchive, nosnippet, noimageindex\n',
    'utf8'
  );

  // Detail pages, named by slug (linked as clean /article/<slug> URLs).
  for (const article of articles) {
    fs.writeFileSync(
      path.join(articleDir, `${article.slug}.html`),
      articlePage({ article, generatedAt }),
      'utf8'
    );
  }

  // Category pages — always generated for every known category (even when
  // empty) so the nav + "read all" links never 404.
  for (const categoryKey of CATEGORIES) {
    const inCat = articles.filter((a) => a.category === categoryKey);
    fs.writeFileSync(
      path.join(categoryDir, `${categoryKey}.html`),
      categoryPage({ categoryKey, articles: inCat, generatedAt }),
      'utf8'
    );
  }

  // Front page.
  const outPath = path.join(outDir, 'index.html');
  fs.writeFileSync(outPath, frontPage({ articles, generatedAt }), 'utf8');

  return { count: articles.length, outPath };
}

/**
 * Give every article a unique `.slug` for this build. Handleized headline +
 * publish date is almost always unique; on the rare collision (same truncated
 * title, same day) we append -2, -3, … so two articles never map to the same
 * file. Assigned oldest-first (the list arrives newest-first) so the earliest
 * article of a colliding pair keeps the clean slug across rebuilds.
 */
function assignSlugs(articles) {
  const used = new Set();
  for (let i = articles.length - 1; i >= 0; i--) {
    const a = articles[i];
    const base = articleSlug(a.headline, a.publishedAt);
    let slug = base;
    for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;
    used.add(slug);
    a.slug = slug;
  }
}
