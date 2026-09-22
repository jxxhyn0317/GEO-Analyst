// Local stand-in for Vercel: serves web/ statically and routes /api/fetch.
// Usage: node dev-server.js  (PORT defaults to 3847)

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, 'web');
const fetchHandler = require('./web/api/fetch.js');
const geminiHandler = require('./web/api/gemini.js');
const PORT = Number(process.env.PORT) || 3847;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon'
};

http.createServer((req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  if (u.pathname === '/api/fetch') return fetchHandler(req, res);
  if (u.pathname === '/api/gemini') return geminiHandler(req, res);

  const file = path.join(ROOT, path.normalize(decodeURIComponent(u.pathname)));
  if (!file.startsWith(ROOT)) { res.statusCode = 403; return res.end(); }
  fs.stat(file, (err, st) => {
    if (!err && st.isDirectory()) {
      if (!u.pathname.endsWith('/')) { res.writeHead(301, { location: u.pathname + '/' + u.search }); return res.end(); }
      return serve(path.join(file, 'index.html'), res);
    }
    serve(file, res);
  });
}).listen(PORT, '127.0.0.1', () => console.log(`GEO Analyst dev server: http://localhost:${PORT}`));

function serve(file, res) {
  fs.readFile(file, (err, buf) => {
    if (err) { res.statusCode = 404; return res.end('Not found'); }
    res.setHeader('content-type', TYPES[path.extname(file)] || 'application/octet-stream');
    res.setHeader('cache-control', 'no-store');
    res.end(buf);
  });
}
