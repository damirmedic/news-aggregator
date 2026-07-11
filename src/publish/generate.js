// Step 7: regenerate the static site from the DB. Writes public/index.html and
// ensures the stylesheet exists. Called at the end of every ingestion cycle.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { getPublishedArticles } from '../db/queries.js';
import { articleCard, pageShell } from './templates.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STYLES_SRC = path.resolve(__dirname, 'assets/styles.css');

/**
 * Render all published articles to public/index.html.
 * @returns {{ count: number, outPath: string }}
 */
export function generateSite() {
  const articles = getPublishedArticles();
  const itemsHtml = articles.map(articleCard).join('\n');
  const html = pageShell({
    itemsHtml,
    count: articles.length,
    generatedAt: new Date().toISOString(),
  });

  const outDir = config.paths.publicDir;
  const assetsDir = path.join(outDir, 'assets');
  fs.mkdirSync(assetsDir, { recursive: true });

  // Copy the stylesheet into the output tree so `public/` is self-contained.
  fs.copyFileSync(STYLES_SRC, path.join(assetsDir, 'styles.css'));

  const outPath = path.join(outDir, 'index.html');
  fs.writeFileSync(outPath, html, 'utf8');
  return { count: articles.length, outPath };
}
