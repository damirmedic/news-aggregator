// Step 3: fetch an article's HTML and extract its main body text using
// Mozilla Readability (the same engine behind Firefox Reader View). We keep
// only the plain text — never storing full source HTML — in line with the
// "store no more than a headline + short quote" principle in CLAUDE.md.
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { config } from '../config.js';

async function fetchHtml(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.ingest.fetchTimeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': config.ingest.userAgent, Accept: 'text/html,*/*' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Extract main body text for an article URL.
 * @param opts.fetchImpl optional override returning HTML (for tests/fixtures)
 * @returns {Promise<{ text: string, wordCount: number }>}
 * @throws if no meaningful body could be extracted (caller marks item 'error')
 */
export async function extractArticleText(url, { fetchImpl = fetchHtml } = {}) {
  const html = await fetchImpl(url);
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const parsed = reader.parse();

  const text = (parsed?.textContent || '').replace(/\s+\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
  const wordCount = text ? text.split(/\s+/).length : 0;

  // Too-short extractions are usually paywalls, consent walls, or video stubs.
  if (wordCount < 40) {
    throw new Error(`extraction too short (${wordCount} words)`);
  }
  return { text, wordCount };
}
