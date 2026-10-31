// Static server for the Next.js export in web/out (trailingSlash routing: /sim/ → /sim/index.html).
// `node serve.mjs [port]` serves it; record.mjs imports startServer() and picks a free port.
import { createServer } from 'node:http'
import { createReadStream, statSync } from 'node:fs'
import { dirname, extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
export const OUT = join(HERE, '..', 'web', 'out')

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.jsonl': 'application/x-ndjson', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.wav': 'audio/wav', '.txt': 'text/plain', '.ico': 'image/x-icon',
}

function resolve(url) {
  let p = decodeURIComponent(url.split('?')[0])
  if (p.endsWith('/')) p += 'index.html'
  const file = normalize(join(OUT, p))
  if (!file.startsWith(OUT)) return null
  for (const cand of [file, `${file}.html`, join(file, 'index.html')]) {
    try { if (statSync(cand).isFile()) return cand } catch { /* next */ }
  }
  return null
}

export function startServer(port = 0) {
  const srv = createServer((req, res) => {
    const file = resolve(req.url ?? '/')
    if (!file) { res.statusCode = 404; res.end('not found'); return }
    res.setHeader('Content-Type', MIME[extname(file)] ?? 'application/octet-stream')
    res.setHeader('Content-Length', statSync(file).size)
    res.setHeader('Cache-Control', 'no-store')
    createReadStream(file).pipe(res)
  })
  return new Promise(ok => srv.listen(port, '127.0.0.1', () => ok({ srv, port: srv.address().port })))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { port } = await startServer(Number(process.argv[2] ?? 8787))
  console.log(`serving ${OUT} at http://127.0.0.1:${port}/`)
}
