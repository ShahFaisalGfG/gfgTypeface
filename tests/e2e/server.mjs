// Static server for e2e fixture pages. Pages named `csp-*.html` get a strict CSP.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./fixtures/', import.meta.url));
const port = Number(process.env.FIXTURE_PORT ?? 4789);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript' };

createServer(async (request, response) => {
  const path = normalize(decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname)).replace(/^([\\/])+/, '');
  try {
    const body = await readFile(join(root, path || 'index.html'));
    const headers = { 'content-type': types[extname(path)] ?? 'application/octet-stream', 'cache-control': 'no-store' };
    if (path.startsWith('csp-')) headers['content-security-policy'] = "default-src 'none'; style-src 'none'; script-src 'unsafe-inline'";
    response.writeHead(200, headers).end(body);
  } catch {
    response.writeHead(404).end('Not found');
  }
}).listen(port, () => console.log(`Fixtures on http://localhost:${port}`));
