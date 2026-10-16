// API keys and settings. Keys can come from environment variables (preferred) or be pasted in the Settings page,
// where they are encrypted with AES-256-GCM using a key derived from ACCESS_CODE and stored server-side.
// Keys are never sent back to the browser; the UI only sees which ones are set and their last 4 characters.
import crypto from 'node:crypto';
import { get, set, hgetall as _hgetall, hincr, expire } from './store.js';

export const KEY_FIELDS = {
  anthropic: { env: 'ANTHROPIC_API_KEY', label: 'Anthropic (Claude)' },
  firecrawl: { env: 'FIRECRAWL_API_KEY', label: 'Firecrawl' },
  apollo: { env: 'APOLLO_API_KEY', label: 'Apollo.io' },
  hunter: { env: 'HUNTER_API_KEY', label: 'Hunter.io' },
  resend: { env: 'RESEND_API_KEY', label: 'Resend' },
  smtpPass: { env: 'SMTP_PASS', label: 'SMTP password or Gmail app password' },
  zoominfo: { env: 'ZOOMINFO_API_KEY', label: 'ZoomInfo', placeholder: true },
  clay: { env: 'CLAY_API_KEY', label: 'Clay', placeholder: true },
  rocketreach: { env: 'ROCKETREACH_API_KEY', label: 'RocketReach', placeholder: true }
};

export const DEFAULT_SETTINGS = {
  // News and launch searches run through Firecrawl each sourcing run. Hiring is not used.
  sourceQueries: [
    'startup launches AI agent for billing OR payments OR "accounts payable" OR accounting',
    '"agentic commerce" OR "agentic payments" startup raises OR launches',
    'fintech raises "Series A" OR "Series B" payments OR billing OR "spend management"',
    'launches wallet OR "instant payouts" OR "corporate card" OR "embedded payments"',
    'marketplace launches "seller payouts" OR "split payments"',
    'cross-border payments OR remittance startup launches OR raises',
    'launches "usage-based billing" OR "automated billing" B2B'
  ],
  recency: 'qdr:m',
  // Source registry crawl and open-search exploration per run.
  sourcesPerRun: 4,
  searchesPerRun: 2,
  suggestDomainAfter: 3,
  maxNewCompaniesPerRun: 15,
  competitorsPerAccount: 3,
  autoFindEmails: false,
  maxEmailLookupsPerRun: 10,
  autoDraft: true,
  modelSmart: 'claude-sonnet-5-5',
  modelFast: 'claude-haiku-5-5',
  sender: { name: '', title: '', fromEmail: '', footer: '' },
  email: { provider: 'none', smtpHost: 'smtp.gmail.com', smtpPort: 465, smtpUser: '', dailyCap: 25 },
  // Daily caps on paid calls, for everyone using the workspace. Owner-only in Settings.
  limits: { anthropic: 400, firecrawl: 300, apollo: 60, hunter: 30 },
  optOut: [],
  excludeExtra: []
};

function encKey() { return crypto.scryptSync(String(process.env.ACCESS_CODE || ''), 'fragment-deal-desk-v1', 32); }
function encrypt(obj) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', encKey(), iv);
  const data = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return { iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: data.toString('base64') };
}
let unreadable = false;
function decrypt(blob) {
  unreadable = false;
  if (!blob) return {};
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', encKey(), Buffer.from(blob.iv, 'base64'));
    d.setAuthTag(Buffer.from(blob.tag, 'base64'));
    return JSON.parse(Buffer.concat([d.update(Buffer.from(blob.data, 'base64')), d.final()]).toString('utf8'));
  } catch { unreadable = true; return {}; }
}

export async function getKeys() {
  const stored = decrypt(await get('keys'));
  const out = {};
  for (const [k, f] of Object.entries(KEY_FIELDS)) out[k] = process.env[f.env] || stored[k] || '';
  // Lets "isn't set up" errors explain the real cause when saved keys exist but can't be decrypted.
  Object.defineProperty(out, '_unreadable', { value: unreadable, enumerable: false });
  return out;
}
export async function keyStatus(role = 'owner') {
  const stored = decrypt(await get('keys'));
  const out = {};
  for (const [k, f] of Object.entries(KEY_FIELDS)) {
    const v = process.env[f.env] || stored[k] || '';
    out[k] = { label: f.label, set: !!v, source: process.env[f.env] ? 'environment' : (stored[k] ? 'settings' : ''), last4: v && role === 'owner' ? v.slice(-4) : '', placeholder: !!f.placeholder };
  }
  return out;
}
export async function keysReadable() { decrypt(await get('keys')); return !unreadable;
}
export async function saveKeys(patch) {
  const stored = decrypt(await get('keys'));
  if (unreadable) for (const k of Object.keys(stored)) delete stored[k]; // old blob from a previous ACCESS_CODE: start fresh
  for (const [k, v] of Object.entries(patch || {})) {
    if (!(k in KEY_FIELDS)) continue;
    if (v === null || v === '') delete stored[k];
    else if (typeof v === 'string' && v.trim()) stored[k] = v.trim();
  }
  await set('keys', encrypt(stored));
}
export async function getSettings() {
  const s = (await get('settings')) || {};
  return { ...DEFAULT_SETTINGS, ...s, sender: { ...DEFAULT_SETTINGS.sender, ...(s.sender || {}) }, email: { ...DEFAULT_SETTINGS.email, ...(s.email || {}) }, limits: { ...DEFAULT_SETTINGS.limits, ...(s.limits || {}) } };
}
export async function saveSettings(patch) {
  const cur = await getSettings();
  const next = { ...cur, ...patch, sender: { ...cur.sender, ...(patch.sender || {}) }, email: { ...cur.email, ...(patch.email || {}) }, limits: { ...cur.limits, ...(patch.limits || {}) } };
  for (const k of Object.keys(DEFAULT_SETTINGS.limits)) next.limits[k] = Math.max(0, Math.min(100000, Math.round(Number(next.limits[k]) || 0)));
  next.sourceQueries = Array.isArray(next.sourceQueries) ? next.sourceQueries.map(q => String(q).trim().slice(0, 300)).filter(Boolean).slice(0, 10) : cur.sourceQueries;
  if (!['', 'qdr:d', 'qdr:w', 'qdr:m', 'qdr:y'].includes(next.recency)) next.recency = cur.recency;
  for (const k of ['optOut', 'excludeExtra']) if (!Array.isArray(next[k])) next[k] = cur[k];
  for (const k of ['maxNewCompaniesPerRun', 'competitorsPerAccount', 'maxEmailLookupsPerRun']) next[k] = Math.max(0, Math.min(100, Number(next[k]) || 0));
  next.sourcesPerRun = Math.max(0, Math.min(30, Math.round(Number(next.sourcesPerRun) || 0)));
  next.searchesPerRun = Math.max(0, Math.min(10, Math.round(Number(next.searchesPerRun) || 0)));
  next.suggestDomainAfter = Math.max(1, Math.min(50, Math.round(Number(next.suggestDomainAfter) || 3)));
  next.email.dailyCap = Math.max(1, Math.min(500, Number(next.email.dailyCap) || 25));
  await set('settings', next);
  return next;
}

// Usage counters per day (UTC). spend() checks the cap first so a runaway run stops cleanly.
const LIMIT_NAMES = { anthropic: 'Claude', firecrawl: 'Firecrawl', apollo: 'Apollo', hunter: 'Hunter' };
const dayKey = () => 'usage:' + new Date().toISOString().slice(0, 10);
export async function usageToday() { return _hgetall(dayKey()); }
export async function remaining(provider) {
  const [s, u] = await Promise.all([getSettings(), usageToday()]);
  return Math.max(0, (s.limits?.[provider] ?? Infinity) - (Number(u[provider]) || 0));
}
export async function spend(provider, n = 1) {
  const left = await remaining(provider);
  if (left < n) {
    const { UserError } = await import('./auth.js');
    throw new UserError(`Today's ${LIMIT_NAMES[provider] || provider} limit is used up. It resets at midnight UTC; the workspace owner can raise it in Settings.`, 429, 'budget');
  }
  await hincr(dayKey(), provider, n);
  expire(dayKey(), 3 * 86400).catch(() => {});
}
export async function record(provider, n) { if (n > 0) { await hincr(dayKey(), provider, n); expire(dayKey(), 3 * 86400).catch(() => {}); } }
