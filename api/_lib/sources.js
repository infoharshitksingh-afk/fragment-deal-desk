// Source registry: the curated pages Deal Desk reads every few days instead of searching at random.
// Each source earns a weight from what it actually produces (accounts kept, Tier 1, contacted, replied),
// smoothed toward a starting guess. Higher weight = checked more often and first in line for the crawl budget.
// Only lines that are new since the last crawl go to Claude, so an unchanged page costs one scrape and nothing else.
import crypto from 'node:crypto';
import { hgetall, hget, hset, hdel, pushLog } from './store.js';
import { getKeys, getSettings } from './keys.js';
import { fcScrape } from './providers.js';
import { normDomain, hostOf, score, ICP } from './icp.js';
import { extractLeads, importLeads, listAccounts } from './pipeline.js';
import { listDomains } from './dataset.js';
import { UserError } from './auth.js';

export const SOURCE_TYPES = ['News', 'Newsletter', 'Directory', 'Launches', 'Event', 'Portfolio', 'Market map', 'Other'];

// Starting registry. "checked" = confirmed public and listing companies when this was built (Oct 16, 2026).
// The rest are checked by their first crawl; three failures in a row pause a source.
export const DEFAULT_SOURCES = [
  { name: 'TechCrunch: Fintech', url: 'https://techcrunch.com/category/fintech/', type: 'News', cadenceDays: 2, prior: 0.5, checked: true },
  { name: 'Crunchbase News: Fintech', url: 'https://news.crunchbase.com/sections/fintech-ecommerce/', type: 'News', cadenceDays: 3, prior: 0.6, checked: true },
  { name: 'This Week in Fintech', url: 'https://www.thisweekinfintech.com/', type: 'Newsletter', cadenceDays: 3, prior: 0.6, checked: true },
  { name: 'Fintech Brainfood', url: 'https://www.fintechbrainfood.com/', type: 'Newsletter', cadenceDays: 7, prior: 0.45, checked: true },
  { name: 'YC companies: Fintech', url: 'https://www.ycombinator.com/companies/industry/fintech', type: 'Directory', cadenceDays: 14, prior: 0.5, checked: true, notes: 'First part of the list loads without scrolling; the rest loads dynamically.' },
  { name: 'FirstMark portfolio', url: 'https://firstmark.com/portfolio/', type: 'Portfolio', cadenceDays: 30, prior: 0.5, warm: true, checked: true, notes: 'Fragment investor: warm intro path.' },
  { name: 'BoxGroup portfolio', url: 'https://www.boxgroup.com/portfolio', type: 'Portfolio', cadenceDays: 30, prior: 0.45, warm: true, notes: 'Fragment investor: warm intro path.' },
  { name: 'YC companies: Finance and accounting', url: 'https://www.ycombinator.com/companies/industry/finance-and-accounting', type: 'Directory', cadenceDays: 14, prior: 0.55 },
  { name: 'Money20/20 USA: speakers', url: 'https://us.money2020.com/speakers', type: 'Event', cadenceDays: 30, prior: 0.5 },
  { name: 'Product Hunt: Fintech', url: 'https://www.producthunt.com/topics/fintech', type: 'Launches', cadenceDays: 3, prior: 0.35 },
  { name: 'a16z: Fintech', url: 'https://a16z.com/fintech/', type: 'Market map', cadenceDays: 14, prior: 0.4 },
  { name: 'Fintech Business Weekly', url: 'https://fintechbusinessweekly.substack.com/archive', type: 'Newsletter', cadenceDays: 7, prior: 0.45 },
  { name: 'PYMNTS: Fintech investments', url: 'https://www.pymnts.com/category/news/fintech-investments/', type: 'News', cadenceDays: 3, prior: 0.4 },
  { name: 'Finextra: Start-ups', url: 'https://www.finextra.com/latest-news/start-ups', type: 'News', cadenceDays: 3, prior: 0.4, notes: 'Blocked a test fetch; may need Firecrawl stealth mode or may pause itself.' },
  { name: 'Fintech Futures: VC funding', url: 'https://www.fintechfutures.com/venture-capital-funding', type: 'News', cadenceDays: 3, prior: 0.45, notes: 'Blocked a test fetch; may pause itself.' },
  { name: 'Nevermined: AI agent payment platforms', url: 'https://nevermined.ai/blog/best-platforms-ai-agent-payments', type: 'Market map', cadenceDays: 60, prior: 0.5, notes: 'Vendor blog listing agentic payments companies.' }
];

const now = () => new Date().toISOString();
const idOf = url => 'src-' + crypto.createHash('sha1').update(String(url).trim().toLowerCase()).digest('hex').slice(0, 10);
const CONTACTED = ['Contacted', 'Replied', 'Meeting set', 'Open deal', 'Customer'];
const REPLIED = ['Replied', 'Meeting set', 'Open deal', 'Customer'];
const K = 4; // smoothing: a source needs about this many kept accounts before its own record outweighs the starting guess

export async function ensureSources() {
  if (process.env.DD_SKIP_SOURCE_SEED) return;
  if (await hget('meta', 'sourcesSeeded')) return;
  await hset('meta', 'sourcesSeeded', now());
  for (const s of DEFAULT_SOURCES) await addSource(s, { quiet: true });
}

function clean(input, cur = {}) {
  const url = String(input.url ?? cur.url ?? '').trim();
  if (!/^https?:\/\/[^\s]+\.[^\s]+/.test(url)) throw new UserError('Enter a full URL starting with https://');
  return {
    ...cur,
    name: String(input.name ?? cur.name ?? hostOf(url)).trim().slice(0, 80) || hostOf(url),
    url,
    type: SOURCE_TYPES.includes(input.type) ? input.type : (cur.type || 'Other'),
    cadenceDays: Math.max(1, Math.min(90, Number(input.cadenceDays ?? cur.cadenceDays) || 7)),
    prior: Math.max(0, Math.min(1, Number(input.prior ?? cur.prior ?? 0.4))),
    warm: !!(input.warm ?? cur.warm),
    notes: String(input.notes ?? cur.notes ?? '').slice(0, 300),
    enabled: input.enabled ?? cur.enabled ?? true
  };
}
export async function addSource(input, { quiet } = {}) {
  const base = clean(input);
  const id = idOf(base.url);
  if (await hget('sources', id)) throw new UserError('That URL is already a source.');
  const s = { id, ...base, status: input.checked ? 'Checked' : 'Unverified', createdAt: now(), stats: { crawls: 0, failures: 0, found: 0, fit: 0, newLines: 0 } };
  await hset('sources', id, s);
  if (!quiet) await pushLog({ stage: 'sources', message: `Added source ${s.name}` });
  return s;
}
export async function updateSource(id, patch) {
  const cur = await hget('sources', id); if (!cur) throw new UserError('Source not found.', 404);
  const next = clean(patch, cur);
  if (patch.enabled === true && cur.status === 'Paused') next.status = cur.stats.crawls ? 'Working' : 'Unverified', next.stats = { ...cur.stats, failures: 0 };
  await hset('sources', id, next); return next;
}
export async function removeSource(id) { await hdel('sources', id); await hdel('corpus', id); }

// Weight in [0, ~1.5]: share of good outcomes among accounts this source produced, pulled toward the prior until it has a record.
export function weightOf(s, acc) {
  const kept = acc.length, tier1 = acc.filter(a => score(a).tier === '1').length;
  const contacted = acc.filter(a => CONTACTED.includes(a.stage)).length, replied = acc.filter(a => REPLIED.includes(a.stage)).length;
  const raw = (tier1 + 0.5 * contacted + 2 * replied + 0.1 * kept + K * s.prior) / (kept + K);
  const w = Math.min(1.5, raw) * (s.warm ? 1.15 : 1);
  return { kept, tier1, contacted, replied, weight: Math.round(w * 1000) / 1000 };
}
function isDue(s, w, at = Date.now()) {
  if (!s.enabled || s.status === 'Paused') return false;
  if (!s.lastCrawl) return true;
  const every = s.cadenceDays / (0.5 + Math.min(1.5, w)); // high weight → checked more often
  return at - Date.parse(s.lastCrawl) >= every * 864e5;
}
export async function listSources() {
  const [sources, accounts] = await Promise.all([hgetall('sources'), listAccounts()]);
  const accs = Object.values(accounts);
  return Object.values(sources).map(s => {
    const acc = accs.filter(a => (a.sourceIds || []).includes(s.id));
    const y = weightOf(s, acc);
    return { ...s, ...y, due: isDue(s, y.weight), nextDue: s.lastCrawl ? new Date(Date.parse(s.lastCrawl) + (s.cadenceDays / (0.5 + Math.min(1.5, y.weight))) * 864e5).toISOString() : null };
  }).sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name));
}

const norm = l => l.replace(/\s+/g, ' ').trim();
export async function crawlSource(id, { force } = {}) {
  const [keys, settings] = await Promise.all([getKeys(), getSettings()]);
  const s = await hget('sources', id); if (!s) throw new UserError('Source not found.', 404);
  const stats = { ...s.stats };
  let text = '';
  try { text = await fcScrape(keys, s.url); }
  catch (e) {
    if (['rate_limit', 'budget', 'missing_key', 'bad_key', 'keys_unreadable', 'limit'].includes(e.code)) throw e;
    stats.failures = (stats.failures || 0) + 1;
    const paused = stats.failures >= 3;
    await hset('sources', id, { ...s, stats, lastCrawl: now(), lastError: e.message.slice(0, 200), status: paused ? 'Paused' : s.status });
    const message = `${s.name}: could not be read (${e.message.slice(0, 80)})${paused ? '. Paused after 3 failures.' : ''}`;
    await pushLog({ stage: 'sources', message });
    return { message, failed: true };
  }
  const lines = [...new Set(String(text).split('\n').map(norm).filter(l => l.length > 25))];
  const prev = (await hget('corpus', id)) || { lines: [] };
  const seen = new Set(prev.lines);
  const fresh = force ? lines : lines.filter(l => !seen.has(l));
  await hset('corpus', id, { lines: [...new Set([...lines, ...prev.lines])].slice(0, 3000), fetchedAt: now(), chars: text.length });
  stats.crawls = (stats.crawls || 0) + 1; stats.failures = 0; stats.newLines = fresh.length;
  let message, out = null, found = 0, fit = 0;
  if (!lines.length) message = `${s.name}: the page came back empty.`;
  else if (!fresh.length) message = `${s.name}: nothing new since the last check.`;
  else {
    const body = fresh.join('\n'), leads = [];
    for (let i = 0; i < Math.min(body.length, 45000); i += 15000) leads.push(...(await extractLeads(keys, settings, `SOURCE: ${s.name} (${s.url})\n\n` + body.slice(i, i + 15000))));
    const uniq = new Map(); for (const l of leads) uniq.set(String(l.company).trim().toLowerCase(), l);
    found = uniq.size;
    const relevant = leads.filter(l => l.relevant !== false).map(l => ({ ...l, url: l.url || s.url }));
    out = await importLeads(relevant, settings, s.name, { sourceId: id });
    fit = out.added + out.updated + out.known;
    stats.found = (stats.found || 0) + found; stats.fit = (stats.fit || 0) + fit;
    message = `${s.name}: ${fresh.length} new lines, ${found} companies, ${fit} fit. ${out.summary}`;
  }
  await hset('sources', id, { ...s, stats, lastCrawl: now(), lastError: '', status: 'Working' });
  await pushLog({ stage: 'sources', message });
  return { message, found, fit, ...(out || {}) };
}

// Pipeline stage: crawl due sources, highest weight first, up to Settings → sources per run.
export async function stageCrawl(crawled = 0) {
  const settings = await getSettings();
  const cap = settings.sourcesPerRun;
  if (!cap) return { remaining: 0, message: 'Source crawling is off in Settings.', crawled };
  if (crawled >= cap) return { remaining: 0, message: `Reached ${cap} sources for this run; the rest wait for the next one.`, crawled };
  const due = (await listSources()).filter(s => s.due);
  if (!due.length) return { remaining: 0, message: 'No sources are due yet.', crawled };
  const r = await crawlSource(due[0].id);
  return { remaining: Math.min(due.length - 1, cap - crawled - 1), message: r.message, crawled: crawled + 1 };
}

// Domains from open searches that keep producing ICP companies and aren't registered yet.
export async function suggestions() {
  const [domains, sources, settings] = await Promise.all([listDomains(), hgetall('sources'), getSettings()]);
  const have = new Set(Object.values(sources).map(s => normDomain(s.url)));
  const min = settings.suggestDomainAfter || 3;
  return Object.values(domains).filter(d => d.fit.length >= min && !have.has(normDomain(d.domain)) && !/google\.|bing\.|linkedin|twitter|x\.com|facebook|youtube|reddit/i.test(d.domain))
    .sort((a, b) => b.fit.length - a.fit.length).slice(0, 12)
    .map(d => ({ domain: d.domain, fit: d.fit.length, seen: d.companies.length, examples: d.fit.slice(-4), lastSeen: d.lastSeen }));
}
