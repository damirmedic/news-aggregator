// Step 3: fetch an article's HTML and extract its main body text using
// Mozilla Readability (the same engine behind Firefox Reader View). We keep
// only the plain text — never storing full source HTML — in line with the
// "store no more than a headline + short quote" principle in CLAUDE.md.
//
// We deliberately do NOT extract the source's own featured image anymore. The
// site's images come from royalty-free stock / self-hosted placeholders (see
// pipeline/resolveImage.js), so nothing copyrighted from the source is ever
// hotlinked or rehosted — see CLAUDE.md's image caveat.
import { JSDOM, VirtualConsole } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { config } from '../config.js';

// Real-world portal HTML routinely embeds CSS jsdom's parser can't handle
// (e.g. nested-selector syntax) — jsdom logs these as console errors by
// default, but they're non-fatal and irrelevant since we never render CSS.
// An unforwarded VirtualConsole keeps them from flooding the logs.
const silentConsole = new VirtualConsole();

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
 * Extract main body text (+ published-time metadata, if present) for an
 * article URL.
 * @param opts.fetchImpl optional override returning HTML (for tests/fixtures)
 * @returns {Promise<{ text: string, wordCount: number, publishedTime: string|null }>}
 * @throws if no meaningful body could be extracted (caller marks item 'error')
 */
export async function extractArticleText(url, { fetchImpl = fetchHtml } = {}) {
  const html = await fetchImpl(url);
  const dom = new JSDOM(html, { url, virtualConsole: silentConsole });
  const document = dom.window.document;
  const reader = new Readability(document);
  const parsed = reader.parse();

  const text = (parsed?.textContent || '').replace(/\s+\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
  const wordCount = text ? text.split(/\s+/).length : 0;

  // Too-short extractions are usually paywalls, consent walls, or video stubs.
  if (wordCount < 40) {
    throw new Error(`extraction too short (${wordCount} words)`);
  }
  // Readability pulls this from the page's own <meta> tags (article:published_time,
  // datePublished, etc.) — the source article's actual publish time, not ours.
  return {
    text,
    wordCount,
    publishedTime: parsed?.publishedTime || null,
  };
}
