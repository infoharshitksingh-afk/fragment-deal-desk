// Storage: Upstash Redis over REST when configured (Vercel marketplace sets KV_REST_API_URL / KV_REST_API_TOKEN),
// otherwise a JSON file (fine for local use; on Vercel it does not persist, and the UI warns about it).
import fs from 'node:fs';

import { UserError } from './auth.js';

// Find the Upstash REST credentials under any of the names Vercel or Upstash use:
// KV_REST_API_URL, UPSTASH_REDIS_REST_URL, or a custom prefix such as STORAGE_KV_REST_API_URL.
// Falls back to a rediss://default:TOKEN@host URL (REDIS_URL / KV_URL), which Upstash also serves over REST.
function findRedis() {
  const env = process.env;
  const pick = re => { const k = Object.keys(env).filter(k => re.test(k) && env[k]).sort((a, b) => a.length - b.length)[0]; return k ? env[k] : ''; };
  let url = pick(/(^|_)(KV_REST_API_URL|REDIS_REST_URL)$/);
  let token = pick(/(^|_)(KV_REST_API_TOKEN|REDIS_REST_TOKEN)$/);
  if (!(url && token)) {
    const raw = pick(/(^|_)(REDIS_URL|KV_URL)$/);
    try {
      const u = new URL(raw);
      if (u.hostname.endsWith('upstash.io') && u.password) { url = 'https://' + u.hostname; token = decodeURIComponent(u.password); }
    } catch {}
  }
  return { url: url.replace(/\/$/, ''), token };
}
const { url: URL_, token: TOKEN } = findRedis();
const FILE = process.env.DD_STORE_FILE || '/tmp/deal-desk-store.json';
const P = 'dd:';

export const persistent = () => !!(URL_ && TOKEN) || !process.env.VERCEL;
export const backend = () => (URL_ && TOKEN) ? 'redis' : 'file';

async function redis(cmd) {
  const r = await fetch(URL_, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error('Database error: ' + (j.error || r.status));
  return j.result;
}
function readFile() { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return {}; } }
// On Vercel each function has its own /tmp, so a file written by Settings is invisible to Run. Refuse instead of losing data.
function writeFile(d) {
  if (process.env.VERCEL) throw new UserError('No database is connected, so nothing can be saved. In Vercel, open Storage, add Upstash Redis, connect it to this project, then redeploy.', 503, 'no_database');
  fs.writeFileSync(FILE, JSON.stringify(d));
}

export async function hgetall(key) {
  if (backend() === 'redis') {
    const arr = await redis(['HGETALL', P + key]) || [];
    const out = {};
    for (let i = 0; i < arr.length; i += 2) { try { out[arr[i]] = JSON.parse(arr[i + 1]); } catch {} }
    return out;
  }
  return { ...(readFile()[P + key] || {}) };
}
export async function hget(key, field) {
  if (backend() === 'redis') { const v = await redis(['HGET', P + key, field]); return v ? JSON.parse(v) : null; }
  return (readFile()[P + key] || {})[field] ?? null;
}
export async function hset(key, field, value) {
  if (backend() === 'redis') return redis(['HSET', P + key, field, JSON.stringify(value)]);
  const d = readFile(); (d[P + key] ||= {})[field] = value; writeFile(d);
}
export async function hdel(key, field) {
  if (backend() === 'redis') return redis(['HDEL', P + key, field]);
  const d = readFile(); if (d[P + key]) delete d[P + key][field]; writeFile(d);
}
export async function get(key) {
  if (backend() === 'redis') { const v = await redis(['GET', P + key]); return v ? JSON.parse(v) : null; }
  return readFile()[P + key] ?? null;
}
export async function set(key, value) {
  if (backend() === 'redis') return redis(['SET', P + key, JSON.stringify(value)]);
  const d = readFile(); d[P + key] = value; writeFile(d);
}
export async function hincr(key, field, by = 1) {
  if (backend() === 'redis') return Number(await redis(['HINCRBY', P + key, field, String(by)]));
  const d = readFile(); const h = (d[P + key] ||= {}); h[field] = (Number(h[field]) || 0) + by; writeFile(d); return h[field];
}
export async function expire(key, seconds) { if (backend() === 'redis') return redis(['EXPIRE', P + key, String(seconds)]); }
export async function pushLog(entry, max = 200) {
  const e = { at: new Date().toISOString(), ...entry };
  if (backend() === 'redis') { await redis(['LPUSH', P + 'log', JSON.stringify(e)]); await redis(['LTRIM', P + 'log', '0', String(max - 1)]); return; }
  const d = readFile(); d[P + 'log'] = [e, ...(d[P + 'log'] || [])].slice(0, max); writeFile(d);
}
export async function getLog(n = 60) {
  if (backend() === 'redis') return ((await redis(['LRANGE', P + 'log', '0', String(n - 1)])) || []).map(x => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean);
  return (readFile()[P + 'log'] || []).slice(0, n);
}
