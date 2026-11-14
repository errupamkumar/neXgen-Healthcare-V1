/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Vercel serverless entry point.
 *
 * vercel.json rewrites every /api/* request here, so the same Express app that
 * runs locally (server.ts) answers the API on Vercel — every route, every
 * booking rule, no second backend to keep in sync. Static pages and assets are
 * served by Vercel's CDN from the Vite build in dist/.
 *
 * Data: set KV_REST_API_URL + KV_REST_API_TOKEN (Vercel KV / Upstash Redis
 * integration) for durable storage. Without them the API runs on an ephemeral
 * /tmp copy of data.json — fine for a demo, reset on every cold start.
 * Check GET /api/health after deploying.
 */
import type { IncomingMessage, ServerResponse } from 'http';
// Explicit .js: Vercel runs this as an ES module, where Node needs extensions.
import app from '../server.js';

export default function handler(req: IncomingMessage, res: ServerResponse) {
  // The rewrite passes the original sub-path as ?__path=… in case the platform
  // hands the function the rewritten URL rather than the original one; restore
  // /api/<path> so Express routing matches either way.
  const url = new URL(req.url || '/', 'http://localhost');
  const original = url.searchParams.get('__path');
  if (original !== null) {
    url.searchParams.delete('__path');
    const query = url.searchParams.toString();
    const pathname = url.pathname.startsWith('/api/') ? url.pathname : `/api/${original.replace(/^\/+/, '')}`;
    req.url = `${pathname}${query ? `?${query}` : ''}`;
  }
  return (app as unknown as (req: IncomingMessage, res: ServerResponse) => void)(req, res);
}
