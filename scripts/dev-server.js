// Local server: serves /public and maps /api/<name> to api/<name>.js, like Vercel does.
// Usage: ACCESS_CODE=test node scripts/dev-server.js   (set MOCK=1 to fake every outside API)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (process.env.MOCK) await import('./mocks.js');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };

export function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      const name = url.pathname.slice(5).replace(/[^a-z-]/g, '');
      const file = path.join(root, 'api', name + '.js');
      if (!fs.existsSync(file)) { res.statusCode = 404; return res.end('Not found'); }
      const mod = await import(pathToFileURL(file).href);
      return mod.default(req, res);
    }
    let p = path.join(root, 'public', url.pathname === '/' ? 'index.html' : url.pathname);
    if (!p.startsWith(path.join(root, 'public')) || !fs.existsSync(p)) { res.statusCode = 404; return res.end('Not found'); }
    res.setHeader('Content-Type', types[path.extname(p)] || 'application/octet-stream');
    fs.createReadStream(p).pipe(res);
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3000;
  createServer().listen(port, () => console.log(`Deal Desk running at http://localhost:${port}`));
}
