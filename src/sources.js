// Source seed list (single source of truth; applied by db/index.js:migrate).
//
// Only feeds marked `active: true` are polled. Each URL below was verified
// live (HTTP 200 + parseable RSS/XML) on 2026-07-11 — see the curl-probing
// pass in the session that added them. ToS/robots.txt was NOT reviewed for
// any of them; that's still on you before any public/production use.
//
// `track` (renamed from the old `category` field to avoid confusion with an
// article's own display category — see articles.category in schema.sql):
//   'hr'    — Croatian portal. Published if it passes the junk filter,
//             no importance gate.
//   'world' — international wire. Only published if the LLM's importance
//             score clears WORLD_SCORE_THRESHOLD (the 90/10 split).
// Every admitted article is then classified into its own display category
// (hrvatska/zagreb/svijet/sport) from its actual content by the LLM —
// independent of which portal or feed it came from.

export const sources = [
  // --- Croatian (HR) ---
  { name: 'Index.hr',            rssUrl: 'https://www.index.hr/rss/vijesti',              track: 'hr', active: true },
  { name: 'Index.hr Sport',      rssUrl: 'https://www.index.hr/rss/sport',                track: 'hr', active: true },
  { name: 'Jutarnji list',       rssUrl: 'https://www.jutarnji.hr/feed',                  track: 'hr', active: true },
  { name: 'Večernji list',       rssUrl: 'https://www.vecernji.hr/feeds/latest',          track: 'hr', active: true },
  { name: 'N1',                  rssUrl: 'https://n1info.hr/feed/',                       track: 'hr', active: true },
  { name: 'Dnevnik.hr',          rssUrl: 'https://dnevnik.hr/assets/feed/articles',       track: 'hr', active: true },
  { name: 'Novi list',           rssUrl: 'https://www.novilist.hr/feed/',                 track: 'hr', active: true },
  { name: 'Slobodna Dalmacija',  rssUrl: 'https://slobodnadalmacija.hr/feed',             track: 'hr', active: true },
  { name: 'Tportal',             rssUrl: 'https://www.tportal.hr/rss-najnovije.xml',      track: 'hr', active: true },
  { name: 'Net.hr',              rssUrl: 'https://net.hr/najnovije/rss.xml',              track: 'hr', active: true },
  // Sportske novosti is now a jutarnji.hr section; this is its dedicated feed
  // (verified real application/rss+xml, 2026-07-15). Any overlap with the main
  // Jutarnji feed is absorbed by URL-dedup / cross-portal dedup.
  { name: 'Sportske novosti',    rssUrl: 'https://www.jutarnji.hr/sportske/feed',         track: 'hr', active: true },

  // --- EU / World, via the Croatian portals' own "Svijet" sections ---
  // These carry world/EU news, in Croatian, ALREADY curated by each portal's
  // editors for relevance to Croatian readers. That editorial curation is the
  // same job the `world`-track importance gate does for raw foreign wires
  // (CLAUDE.md: keep out "routine wire coverage"), so these are `hr`-track
  // (ungated) rather than importance-scored — cheaper on the LLM budget and
  // consistent with how world stories in the general feeds already flow.
  // Content classification still files them under the "Svijet" category, and
  // cross-portal dedup collapses the same event reported by several of them.
  // (Verified real RSS with items, 2026-07-15.)
  { name: 'Index.hr Svijet',     rssUrl: 'https://www.index.hr/rss/vijesti-svijet',       track: 'hr', active: true },
  { name: 'Jutarnji Svijet',     rssUrl: 'https://www.jutarnji.hr/vijesti/svijet/feed',   track: 'hr', active: true },
  { name: 'N1 Svijet',           rssUrl: 'https://n1info.hr/svijet/feed/',                track: 'hr', active: true },

];

export default sources;
