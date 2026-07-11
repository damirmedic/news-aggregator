// Source seed list (single source of truth; applied by db/index.js:migrate).
//
// Only feeds marked `active: true` are polled. Per CLAUDE.md, each feed's URL
// and terms of service must be confirmed before enabling — so we ship with just
// Index.hr and one world feed active for a tame first run, and leave the rest
// as verified-URL placeholders to flip on later.
//
// category: 'hr' (published if it passes the junk filter) | 'world' (also
// gated by an LLM importance score >= WORLD_SCORE_THRESHOLD — the 90/10 split).

export const sources = [
  // --- Croatian (HR) ---
  { name: 'Index.hr',            rssUrl: 'https://www.index.hr/rss/vijesti',              category: 'hr',    active: true  },
  { name: '24sata',             rssUrl: 'https://www.24sata.hr/feeds/news.xml',          category: 'hr',    active: false },
  { name: 'Jutarnji list',      rssUrl: 'https://www.jutarnji.hr/rss',                   category: 'hr',    active: false },
  { name: 'Večernji list',      rssUrl: 'https://www.vecernji.hr/feeds/latest',          category: 'hr',    active: false },
  { name: 'N1',                 rssUrl: 'https://n1info.hr/feed/',                        category: 'hr',    active: false },
  { name: 'HRT',                rssUrl: 'https://vijesti.hrt.hr/rss',                     category: 'hr',    active: false },
  { name: 'Dnevnik.hr',         rssUrl: 'https://dnevnik.hr/assets/feed/articles',       category: 'hr',    active: false },
  { name: 'Novi list',          rssUrl: 'https://www.novilist.hr/feed/',                 category: 'hr',    active: false },
  { name: 'Slobodna Dalmacija', rssUrl: 'https://slobodnadalmacija.hr/feed',             category: 'hr',    active: false },

  // --- EU / World ---
  // Wire-style + EU-policy feeds. Confirm license terms before turning others on.
  { name: 'Al Jazeera',         rssUrl: 'https://www.aljazeera.com/xml/rss/all.xml',     category: 'world', active: true  },
  { name: 'Euractiv',           rssUrl: 'https://www.euractiv.com/feed/',                category: 'world', active: false },
  { name: 'Politico Europe',    rssUrl: 'https://www.politico.eu/feed/',                 category: 'world', active: false },
];

export default sources;
