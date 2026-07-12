// Step 3: fetch an article's HTML and extract its main body text using
// Mozilla Readability (the same engine behind Firefox Reader View). We keep
// only the plain text — never storing full source HTML — in line with the
// "store no more than a headline + short quote" principle in CLAUDE.md.
//
// Featured image: we also pull the article's og:image URL and hotlink it
// directly from the source (never downloaded/rehosted), shown with a visible
// "Foto: [Source]" credit. This is a deliberate, tracked exception to the
// "headline + quote only" principle above — see the caveat in CLAUDE.md.
import { JSDOM, VirtualConsole } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { config } from '../config.js';

// Real-world portal HTML routinely embeds CSS jsdom's parser can't handle
// (e.g. nested-selector syntax) — jsdom logs these as console errors by
// default, but they're non-fatal and irrelevant since we never render CSS.
// An unforwarded VirtualConsole keeps them from flooding the logs.
const silentConsole = new VirtualConsole();

const IMAGE_META_SELECTORS = [
  'meta[property="og:image:secure_url"]',
  'meta[property="og:image"]',
  'meta[name="twitter:image"]',
  'meta[name="twitter:image:src"]',
];

/** First valid absolute http(s) image URL from the page's social-preview meta tags. */
function extractFeaturedImageUrl(document, baseUrl) {
  for (const selector of IMAGE_META_SELECTORS) {
    const content = document.querySelector(selector)?.getAttribute('content');
    if (!content) continue;
    try {
      const resolved = new URL(content, baseUrl);
      if (resolved.protocol === 'http:' || resolved.protocol === 'https:') {
        return resolved.href;
      }
    } catch {
      // malformed URL in the source's meta tag; try the next selector
    }
  }
  return null;
}

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
 * Extract main body text (+ published-time and featured-image metadata, if
 * present) for an article URL.
 * @param opts.fetchImpl optional override returning HTML (for tests/fixtures)
 * @returns {Promise<{ text: string, wordCount: number, publishedTime: string|null, imageUrl: string|null }>}
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
    imageUrl: extractFeaturedImageUrl(document, url),
  };
}
