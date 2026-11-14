// Runs api/index.ts the way Vercel does (VERCEL=1, handler only, no listen()).
//   node --import tsx scripts/qa/vercel-sim/sim.mjs      (run from the project root)
// With KV_REST_API_URL/KV_REST_API_TOKEN pointing at fake-kv.mjs it exercises
// the durable store; without them, the ephemeral /tmp store.
// SIM_REWRITE=1 hands the handler the *rewritten* URL (/api?__path=…) instead
// of the original, to prove the routing shim works either way.
import http from 'node:http';

process.env.VERCEL = '1';
const PORT = Number(process.env.SIM_PORT || 3010);
const ROOT = new URL('../../../', import.meta.url);
const { default: handler } = await import(new URL('api/index.ts', ROOT).href);

http
  .createServer((req, res) => {
    if (process.env.SIM_REWRITE === '1' && req.url.startsWith('/api/')) {
      const u = new URL(req.url, 'http://x');
      const sub = u.pathname.slice('/api/'.length);
      u.searchParams.set('__path', sub);
      req.url = `/api?${u.searchParams.toString()}`;
    }
    handler(req, res);
  })
  .listen(PORT, () => console.log(`vercel sim on ${PORT} (rewrite=${process.env.SIM_REWRITE === '1'})`));
