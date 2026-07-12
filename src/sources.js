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
  { name: '24sata',              rssUrl: 'https://www.24sata.hr/feeds/news.xml',          track: 'hr', active: true },
  { name: 'Jutarnji list',       rssUrl: 'https://www.jutarnji.hr/feed',                  track: 'hr', active: true },
  { name: 'Večernji list',       rssUrl: 'https://www.vecernji.hr/feeds/latest',          track: 'hr', active: true },
  { name: 'N1',                  rssUrl: 'https://n1info.hr/feed/',                       track: 'hr', active: true },
  { name: 'Dnevnik.hr',          rssUrl: 'https://dnevnik.hr/assets/feed/articles',       track: 'hr', active: true },
  { name: 'Novi list',           rssUrl: 'https://www.novilist.hr/feed/',                 track: 'hr', active: true },
  { name: 'Slobodna Dalmacija',  rssUrl: 'https://slobodnadalmacija.hr/feed',             track: 'hr', active: true },
  { name: 'Tportal',             rssUrl: 'https://www.tportal.hr/rss-najnovije.xml',      track: 'hr', active: true },
  { name: 'Net.hr',              rssUrl: 'https://net.hr/najnovije/rss.xml',              track: 'hr', active: true },
  // HRT: no working RSS URL found (homepage advertises none; every guessed
  // path 404s as of 2026-07-11) — may require a different discovery method
  // (JSON API?) or may no longer offer RSS. Needs manual research.
  { name: 'HRT',                 rssUrl: 'https://vijesti.hrt.hr/rss',                    track: 'hr', active: false },

  // --- EU / World ---
  // Wire-style + EU-policy feeds. Confirm license terms before turning others on.
  { name: 'Al Jazeera',          rssUrl: 'https://www.aljazeera.com/xml/rss/all.xml',     track: 'world', active: true  },
  { name: 'Euractiv',            rssUrl: 'https://www.euractiv.com/feed/',                track: 'world', active: false },
  { name: 'Politico Europe',     rssUrl: 'https://www.politico.eu/feed/',                 track: 'world', active: false },
];

export default sources;
