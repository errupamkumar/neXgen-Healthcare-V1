// Minimal Upstash / Vercel KV REST API: GET /get/<key>, POST /set/<key> (value in body).
import http from 'node:http';
import fs from 'node:fs';
const PORT = Number(process.argv[2] || 3011);
const DUMP = process.argv[3]; // optional file to mirror the store into
const store = new Map();
http
  .createServer((req, res) => {
    if (req.headers.authorization !== 'Bearer test-token') {
      res.writeHead(401, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Unauthorized' }));
    }
    const [, cmd, rawKey] = req.url.split('/');
    const key = decodeURIComponent(rawKey || '');
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' });
      if (cmd === 'get') return res.end(JSON.stringify({ result: store.has(key) ? store.get(key) : null }));
      if (cmd === 'set') {
        store.set(key, body);
        if (DUMP) fs.writeFileSync(DUMP, body);
        return res.end(JSON.stringify({ result: 'OK' }));
      }
      res.end(JSON.stringify({ error: 'unknown command' }));
    });
  })
  .listen(PORT, () => console.log(`fake kv on ${PORT}`));
