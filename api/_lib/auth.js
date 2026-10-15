// Access gate and request helpers. Every API route except /api/cron needs an access code:
// ACCESS_CODE (environment variable) signs in as the owner; a team code, set by the owner in Settings and stored hashed,
// signs in as team. Team members see and work the same data, run on the owner's keys, and can't see keys or change limits.
import crypto from 'node:crypto';

export function safeEqual(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function hashCode(code, salt) { return crypto.scryptSync(String(code), salt, 32).toString('hex'); }

export async function requireAccess(req, res) {
  const code = process.env.ACCESS_CODE;
  if (!code) { send(res, 503, { error: 'setup', message: 'Set an ACCESS_CODE environment variable in Vercel, then redeploy.' }); return null; }
  const given = String(req.headers['x-access-code'] || '');
  if (given && safeEqual(given, code)) return 'owner';
  if (given) {
    try {
      const { get } = await import('./store.js');
      const team = await get('team');
      if (team?.hash && team?.salt && safeEqual(hashCode(given, team.salt), team.hash)) return 'team';
    } catch {}
  }
  send(res, 401, { error: 'unauthorized', message: 'Wrong access code.' }); return null;
}
export function ownerOnly(req) { if (req.role !== 'owner') throw new UserError('Only the workspace owner can change this.', 403, 'owner_only'); }

export function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export async function readBody(req) {
  if (req.body !== undefined) return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

export function handle(fn) {
  return async (req, res) => {
    globalThis.__ddReqStart = Date.now();
    try {
      const role = await requireAccess(req, res);
      if (!role) return;
      req.role = role;
      await fn(req, res);
    } catch (e) {
      console.error(e);
      send(res, e.status || 500, { error: e.code || 'error', message: e.message || 'Something went wrong.' });
    }
  };
}

export class UserError extends Error { constructor(message, status = 400, code = 'bad_request') { super(message); this.status = status; this.code = code; } }
