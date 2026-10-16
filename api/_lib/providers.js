// Thin clients for each outside service, called with the keys from Settings or environment variables.
// Endpoint paths are kept in one place so they are easy to update if a provider changes its API.
import { UserError } from './auth.js';
import { spend, record, remaining } from './keys.js';

export const ENDPOINTS = {
  anthropic: 'https://api.anthropic.com/v1/messages',
  firecrawlSearch: 'https://api.firecrawl.dev/v2/search',
  firecrawlScrape: 'https://api.firecrawl.dev/v2/scrape',
  apolloPeopleSearch: 'https://api.apollo.io/api/v1/mixed_people/api_search',
  apolloPeopleMatch: 'https://api.apollo.io/api/v1/people/match',
  hunterFinder: 'https://api.hunter.io/v2/email-finder',
  resend: 'https://api.resend.com/emails'
};

function need(key, name, keys) {
  if (key) return;
  if (keys?._unreadable) throw new UserError(`${name}: the saved keys can't be read, usually because ACCESS_CODE changed after they were saved. Paste the keys again in Settings.`, 400, 'keys_unreadable');
  throw new UserError(`${name} isn't set up. Add its API key in Settings (or set it as an environment variable in Vercel and redeploy).`, 400, 'missing_key');
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
// Retries stay well inside the 300s function limit; handle() stamps the request start time.
const elapsed = () => Date.now() - (globalThis.__ddReqStart || Date.now());

// How long a 429 asks us to wait: Retry-After header, "retry after 30s", or "resets at <date>".
function waitFor(r, text) {
  const h = Number(r.headers.get('retry-after'));
  if (h > 0) return h * 1000;
  const m = text.match(/retry after (\d+)\s*s/i); if (m) return Number(m[1]) * 1000;
  const d = text.match(/resets at ([^"\\]+?GMT[+-]\d{4})/); if (d) { const t = Date.parse(d[1]) - Date.now(); if (t > 0) return t; }
  return 20000;
}

async function call(url, opts, name, tries = 3) {
  for (let attempt = 1; ; attempt++) {
    let r;
    try { r = await fetch(url, opts); } catch (e) { throw new UserError(`${name} couldn't be reached (${e.message}).`, 502, 'unreachable'); }
    const text = await r.text();
    let j; try { j = JSON.parse(text); } catch { j = { raw: text }; }
    if (r.ok) return j;
    const msg = j?.error?.message || j?.error || j?.message || (j?.description ? `${j.title ? j.title + ': ' : ''}${j.description}` : '') || text.slice(0, 200);
    const msgStr = typeof msg === 'string' ? msg : JSON.stringify(msg);
    if (r.status === 429) {
      const wait = Math.min(waitFor(r, text) + 1000, 65000);
      if (attempt < tries && elapsed() + wait < 230000) { await sleep(wait); continue; }
      throw new UserError(`${name} is rate limited. The run will pause and continue. (${msgStr.slice(0, 120)})`, 429, 'rate_limit');
    }
    const code = r.status === 401 || r.status === 403 ? 'bad_key' : r.status === 402 ? 'limit' : 'provider_error';
    throw new UserError(`${name} returned ${r.status}: ${msgStr}`, 502, code);
  }
}

// Firecrawl's free and hobby plans allow only a few requests a minute, so its calls go out one at a time
// with a short gap (FIRECRAWL_GAP_MS, default 1500) instead of in parallel bursts.
let fcQueue = Promise.resolve();
const FC_GAP = Number(process.env.FIRECRAWL_GAP_MS ?? 1500);
async function fcCall(url, opts) {
  await spend('firecrawl');
  const run = fcQueue.then(() => call(url, opts, 'Firecrawl', 4));
  fcQueue = run.catch(() => {}).then(() => sleep(FC_GAP));
  return run;
}

/* ---------- Claude ---------- */
export async function claude(keys, prompt, { model, maxTokens = 2500 } = {}) {
  need(keys.anthropic, 'Anthropic', keys);
  await spend('anthropic');
  const j = await call(ENDPOINTS.anthropic, {
    method: 'POST',
    headers: { 'x-api-key': keys.anthropic, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] })
  }, 'Anthropic');
  return (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
}
export function parseJson(text) {
  const t = String(text || '').trim();
  try { return JSON.parse(t); } catch {}
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/); if (fence) { try { return JSON.parse(fence[1]); } catch {} }
  const s = Math.min(...['{', '['].map(c => t.indexOf(c)).filter(i => i >= 0));
  const e = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  if (isFinite(s) && e > s) { try { return JSON.parse(t.slice(s, e + 1)); } catch {} }
  // A reply cut off by the token limit: keep every complete object in the array and close it.
  const a = t.indexOf('[');
  if (a >= 0) {
    for (let cut = t.lastIndexOf('}'); cut > a; cut = t.lastIndexOf('}', cut - 1)) {
      try { const arr = JSON.parse(t.slice(a, cut + 1).replace(/,\s*$/, '') + ']'); if (Array.isArray(arr)) return arr; } catch {}
    }
  }
  throw new UserError("Claude's answer couldn't be read as JSON.", 502, 'invalid_json');
}
export async function claudeJson(keys, prompt, opts) { return parseJson(await claude(keys, prompt + '\n\nReply with the JSON only.', opts)); }

/* ---------- Firecrawl ---------- */
export async function fcSearch(keys, query, { limit = 8, news = false, tbs } = {}) {
  need(keys.firecrawl, 'Firecrawl', keys);
  const body = { query, limit, sources: news ? [{ type: 'web' }, { type: 'news' }] : [{ type: 'web' }] };
  if (tbs) body.tbs = tbs;
  const j = await fcCall(ENDPOINTS.firecrawlSearch, { method: 'POST', headers: { Authorization: `Bearer ${keys.firecrawl}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 'Firecrawl');
  const d = j.data || {};
  if (Array.isArray(d)) return { web: d, news: [] };
  return { web: d.web || [], news: d.news || [] };
}
export async function fcScrape(keys, url) {
  need(keys.firecrawl, 'Firecrawl', keys);
  const j = await fcCall(ENDPOINTS.firecrawlScrape, { method: 'POST', headers: { Authorization: `Bearer ${keys.firecrawl}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true }) }, 'Firecrawl');
  return j.data?.markdown || j.markdown || '';
}

/* ---------- Apollo ---------- */
export async function apolloPeopleSearch(keys, { domain, titles, perPage = 5 }) {
  need(keys.apollo, 'Apollo', keys);
  await spend('apollo');
  const j = await call(ENDPOINTS.apolloPeopleSearch, {
    method: 'POST', headers: { 'x-api-key': keys.apollo, 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
    body: JSON.stringify({ q_organization_domains_list: [domain], person_titles: titles, person_seniorities: ['director', 'vp', 'head', 'c_suite'], per_page: perPage })
  }, 'Apollo');
  return (j.people || j.contacts || []).map(p => ({ apolloId: p.id, name: [p.first_name, p.last_name].filter(Boolean).join(' ') || p.name || '', title: p.title || '', linkedin: p.linkedin_url || '' }));
}
export async function apolloMatch(keys, { apolloId, name, domain, company, linkedin }) {
  need(keys.apollo, 'Apollo', keys);
  await spend('apollo');
  const body = apolloId ? { id: apolloId } : { name, domain, organization_name: company };
  if (linkedin) body.linkedin_url = linkedin;
  const j = await call(ENDPOINTS.apolloPeopleMatch, { method: 'POST', headers: { 'x-api-key': keys.apollo, 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }, body: JSON.stringify(body) }, 'Apollo');
  const p = j.person || {};
  const email = p.email && !/email_not_unlocked|domain\.com$/i.test(p.email) ? p.email : '';
  return { email, status: p.email_status || '', name: [p.first_name, p.last_name].filter(Boolean).join(' ') || p.name || '', title: p.title || '', linkedin: p.linkedin_url || '' };
}

/* ---------- Hunter ---------- */
export async function hunterFind(keys, { name, domain }) {
  need(keys.hunter, 'Hunter', keys);
  await spend('hunter');
  const [first, ...rest] = String(name).trim().split(/\s+/);
  const q = new URLSearchParams({ domain, first_name: first || '', last_name: rest.join(' '), api_key: keys.hunter });
  const j = await call(`${ENDPOINTS.hunterFinder}?${q}`, { method: 'GET' }, 'Hunter');
  const d = j.data || {};
  return { email: d.email || '', status: d.verification?.status || (d.score != null ? `score ${d.score}` : '') };
}

/* ---------- Email ---------- */
export async function sendEmail(keys, settings, { to, subject, text }) {
  const s = settings.sender, e = settings.email;
  if (!s.fromEmail) throw new UserError('Set a sender email in Settings first.', 400, 'missing_sender');
  const from = s.name ? `${s.name} <${s.fromEmail}>` : s.fromEmail;
  if (e.provider === 'resend') {
    need(keys.resend, 'Resend', keys);
    const j = await call(ENDPOINTS.resend, { method: 'POST', headers: { Authorization: `Bearer ${keys.resend}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to: [to], subject, text, reply_to: s.fromEmail }) }, 'Resend');
    return { id: j.id || '' };
  }
  if (e.provider === 'smtp') {
    need(keys.smtpPass, 'SMTP', keys);
    const nodemailer = (await import('nodemailer')).default;
    const t = nodemailer.createTransport({ host: e.smtpHost, port: Number(e.smtpPort) || 465, secure: Number(e.smtpPort) === 465, auth: { user: e.smtpUser || s.fromEmail, pass: keys.smtpPass } });
    const info = await t.sendMail({ from, to, subject, text, replyTo: s.fromEmail });
    return { id: info.messageId || '' };
  }
  throw new UserError('Choose an email provider in Settings (Resend or Gmail/SMTP) before sending.', 400, 'no_provider');
}
