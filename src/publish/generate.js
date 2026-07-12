// Step 7: regenerate the static site from the DB. Writes public/index.html, one
// public/article/{id}.html detail page per article, and the stylesheet.
// Called at the end of every ingestion cycle.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { getPublishedArticles } from '../db/queries.js';
import { frontPage, articlePage, categoryPage, CATEGORIES } from './templates.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STYLES_SRC = path.resolve(__dirname, 'assets/styles.css');

/**
 * Render the whole static site.
 * @returns {{ count: number, outPath: string }}
 */
export function generateSite() {
  const retentionMs = config.freshness.articleRetentionDays * 24 * 60 * 60 * 1000;
  const sinceIso = new Date(Date.now() - retentionMs).toISOString();
  const articles = getPublishedArticles({ sinceIso });
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

  // Copy the stylesheet so public/ is self-contained.
  fs.copyFileSync(STYLES_SRC, path.join(assetsDir, 'styles.css'));

  // Detail pages.
  for (const article of articles) {
    fs.writeFileSync(
      path.join(articleDir, `${article.id}.html`),
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
