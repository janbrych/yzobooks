// Disk cache for fetch() so benchmark re-runs (after tweaking the heuristics)
// are fast and don't hammer the public catalogs. Only GET responses are cached.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const dir = path.join(import.meta.dirname, 'data', 'http-cache');
mkdirSync(dir, { recursive: true });
const realFetch = globalThis.fetch;
export const stats = { hits: 0, misses: 0 };

let active = 0;
const queue = [];
const MAX_PARALLEL = 8;
async function limited(fn) {
  if (active >= MAX_PARALLEL) await new Promise((r) => queue.push(r));
  active++;
  try { return await fn(); } finally { active--; queue.shift()?.(); }
}

export function installFetchCache() {
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    if (init.method && init.method !== 'GET') return realFetch(input, init);
    const file = path.join(dir, createHash('sha1').update(url).digest('hex') + '.json');
    if (existsSync(file)) {
      stats.hits++;
      const c = JSON.parse(readFileSync(file, 'utf8'));
      return new Response(c.status === 204 || c.status === 304 ? null : Buffer.from(c.body, 'base64'), { status: c.status, headers: { 'content-type': c.type } });
    }
    stats.misses++;
    return limited(async () => {
      let res;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          res = await realFetch(url, { ...init, signal: AbortSignal.timeout(20000) });
          if (res.status !== 429 && res.status < 500) break;
        } catch (e) { res = null; }
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      }
      if (!res) return new Response('', { status: 599 });
      const body = Buffer.from(await res.arrayBuffer());
      const type = res.headers.get('content-type') || '';
      // Don't cache throttling / server errors.
      if (res.status !== 429 && res.status < 500) writeFileSync(file, JSON.stringify({ status: res.status, type, body: body.toString('base64') }));
      return new Response(res.status === 204 ? null : body, { status: res.status, headers: { 'content-type': type } });
    });
  };
}
