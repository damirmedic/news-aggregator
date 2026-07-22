// Dependency-free static preview server for the generated public/ directory.
// This is only for local preview (`npm run serve`) — in production the static
// files would be served by nginx/CDN/etc. Reads are static; no DB access.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

export function startServer({ port = config.server.port } = {}) {
  const root = config.paths.publicDir;

  const server = http.createServer((req, res) => {
    // Strip query string and normalize; default to index.html.
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    if (urlPath.endsWith('/')) urlPath += 'index.html';

    // Resolve within root; reject path traversal.
    const filePath = path.join(root, path.normalize(urlPath));
    if (!filePath.startsWith(root)) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    // Clean URLs: article links have no extension (/article/<slug>), so an
    // extensionless miss retries as "<path>.html" — the same mapping Cloudflare
    // Pages does in production.
    const candidates = path.extname(filePath)
      ? [filePath]
      : [filePath, `${filePath}.html`];

    const tryNext = (i) => {
      if (i >= candidates.length) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>404</h1><p>Not found. Have you run <code>npm run ingest</code>?</p>');
        return;
      }
      fs.readFile(candidates[i], (err, data) => {
        if (err) return tryNext(i + 1);
        res.writeHead(200, { 'Content-Type': MIME[path.extname(candidates[i])] || 'application/octet-stream' });
        res.end(data);
      });
    };
    tryNext(0);
  });

  server.listen(port, () => {
    console.log(`[serve] preview at http://localhost:${port}  (serving ${root})`);
  });
  return server;
}
