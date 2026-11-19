const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(process.argv[2]);
const built = path.join(root, '.next', 'server', 'app');
const publicDir = path.join(root, 'public');
const staticDir = path.join(root, '.next', 'static');
const contentTypes = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.ico':'image/x-icon','.json':'application/json'};
http.createServer((req,res)=>{
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400).end(); return; }
  let file;
  if (pathname.startsWith('/_next/static/')) file = path.join(staticDir, pathname.slice('/_next/static/'.length));
  else if (pathname.startsWith('/_next/')) { res.writeHead(404).end(); return; }
  else if (path.extname(pathname)) file = path.join(publicDir, pathname.replace(/^\//,''));
  else { const route = pathname === '/' ? 'index' : pathname.slice(1); file = path.join(built, `${route}.html`); }
  if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end('Not found'); return; }
  res.writeHead(200, {'Content-Type':contentTypes[path.extname(file)] || 'application/octet-stream','Cache-Control':'no-store'});
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}).listen(5181,'127.0.0.1');
