// The agent. Each stage does one bounded unit of work per call so runs never hit function time limits;
// the browser (or the daily cron) calls stages in order until each reports nothing left.
import { hgetall, hget, hset, hdel, pushLog } from './store.js';
import { getKeys, getSettings } from './keys.js';
import { claude, claudeJson, theirstackJobs, fcSearch, fcScrape, apolloPeopleSearch, apolloMatch, hunterFind, sendEmail } from './providers.js';
import { ICP, EXCLUDE_RE, CUSTOMER_RE, CUSTOMERS, FORMATS, PERSONAS, DEFAULT_SLOTS, PROOF, slug, normDomain, docId, hostOf, today, score, roleFor, pickFormat } from './icp.js';
import { UserError } from './auth.js';

const BAD_HOSTS = /linkedin|wikipedia|facebook|twitter|x\.com|instagram|youtube|glassdoor|indeed|zoominfo|crunchbase|bloomberg|dnb\.com|rocketreach|apollo\.io|craft\.co|comparably|builtin|ziprecruiter|tsenta|lusha|owler|yahoo|reuters|sec\.gov|google\.|bing\.|mapquest|yelp|bbb\.org|greenhouse\.io|lever\.co|ashbyhq|myworkdayjobs|workday\.com|icims|smartrecruiters/i;
const ATS = /greenhouse\.io|lever\.co|myworkdayjobs|workday|ashbyhq|icims|successfactors|smartrecruiters|jobvite|taleo|oraclecloud|eightfold|phenom|\/careers|careers\.|jobs\./i;
const now = () => new Date().toISOString();

/* ---------- data access ---------- */
export const listAccounts = () => hgetall('accounts');
export const getAccount = id => hget('accounts', id);
export async function saveAccount(id, a) { a.updatedAt = now(); await hset('accounts', id, a); return a; }
export async function patchAccount(id, patch) { const a = await getAccount(id); if (!a) throw new UserError('Account not found.', 404); return saveAccount(id, { ...a, ...patch }); }
export async function deleteAccount(id) {
  const a = await getAccount(id); await hdel('accounts', id);
  if (a) { const r = await hget('registry', slug(a.name)); if (r) await hset('registry', slug(a.name), { ...r, status: 'removed', accountId: null, lastSeen: now() }); }
}
export const listRegistry = () => hgetall('registry');

export function withScore(a) { const sc = score(a); return { ...a, score: { fit: sc.fit, timing: sc.timing, tier: sc.tier, parts: sc.parts, useCase: sc.useCase }, signals: sc.signals }; }

async function findExisting(name, domain) {
  const reg = await listRegistry();
  const s = slug(name), d = normDomain(domain);
  if (reg[s]) return reg[s];
  if (d) return Object.values(reg).find(r => normDomain(r.domain) === d) || null;
  return null;
}
async function register(name, entry) {
  const key = slug(name), cur = await hget('registry', key);
  await hset('registry', key, { name, firstSeen: cur?.firstSeen || now(), ...cur, ...entry, lastSeen: now() });
}
function isExcluded(name, settings) {
  if (CUSTOMER_RE.test(String(name).trim())) return 'Existing Fragment customer (public customers page)';
  if (EXCLUDE_RE.test(name)) return 'Ledger vendor, infrastructure partner, consultancy or staffing firm';
  if ((settings.excludeExtra || []).some(x => x && name.toLowerCase().includes(String(x).toLowerCase()))) return 'On your exclude list';
  return '';
}

/** Adds a company if it isn't already known. Returns {status, id}. */
export async function upsertCompany({ name, domain = '', source, signals = [], competitorOf = '', fields = {} }, settings) {
  name = String(name || '').trim(); if (!name) return { status: 'skipped' };
  const ex = await findExisting(name, domain);
  if (ex) {
    if (ex.status === 'account' && ex.accountId) {
      const a = await getAccount(ex.accountId);
      if (a && signals.length) {
        const have = new Set((a.importedSignals || []).map(x => x.quote));
        const add = signals.filter(x => !have.has(x.quote));
        if (add.length) await saveAccount(ex.accountId, { ...a, importedSignals: [...(a.importedSignals || []), ...add].slice(-12) });
        return { status: add.length ? 'updated' : 'known', id: ex.accountId };
      }
      return { status: 'known', id: ex.accountId };
    }
    await register(name, { lastSource: source });
    return { status: 'known-' + ex.status };
  }
  const why = isExcluded(name, settings);
  if (why) { await register(name, { domain, status: 'excluded', reason: why, source }); return { status: 'excluded' }; }
  const id = docId(domain, name);
  const a = { name, domain: normDomain(domain), industry: '', revenue: '', geo: '', ownership: '', careersUrl: '', newsUrl: '', stage: 'New', owner: '', notes: '', contacts: [], importedSignals: signals, source, competitorOf, createdAt: now(), ...fields };
  await saveAccount(id, a);
  await register(name, { domain: a.domain, status: 'account', accountId: id, source, competitorOf });
  return { status: 'added', id };
}

/* ---------- stage: source jobs ---------- */
function sourcingQueries(settings) {
  const roles = (settings.roles || []).filter(Boolean).slice(0, 8);
  const roleExpr = roles.map(r => `"${r}"`).join(' OR ');
  return (settings.portals || []).filter(Boolean).slice(0, 8).map(p => `site:${p} (${roleExpr})`);
}
// TheirStack: structured postings, no extraction step. Only fetches jobs posted since the last run so credits aren't spent twice.
async function sourceTheirStack(keys, settings) {
  const f = settings.theirstack || {};
  const last = await hget('meta', 'theirstackLastRun');
  const jobs = await theirstackJobs(keys, f, { sinceDate: last || undefined });
  const mapped = jobs.map(j => ({
    company: j.company, domain: j.domain, title: j.title, location: j.location, url: j.url,
    days_ago: j.datePosted ? Math.max(0, Math.round((Date.now() - Date.parse(j.datePosted)) / 864e5)) : null,
    tech: j.tech, vendor: false
  }));
  const out = await importJobs(mapped, settings, 'TheirStack');
  await hset('meta', 'theirstackLastRun', today());
  const full = jobs.length >= (f.limit || 50);
  const msg = `TheirStack: ${jobs.length} postings${last ? ' since ' + last : ` from the last ${f.maxAgeDays ?? 7} days`}. ${out.summary}${full ? ' Hit the per-run job limit; raise it in Settings to pull more.' : ''}`;
  await pushLog({ stage: 'source', message: msg });
  return { remaining: 0, message: msg, ...out };
}

export async function stageSource() {
  const [keys, settings] = await Promise.all([getKeys(), getSettings()]);
  if (keys.theirstack) return sourceTheirStack(keys, settings);
  const queries = sourcingQueries(settings);
  if (!queries.length) return { remaining: 0, message: 'No portals or roles set in Settings, so sourcing was skipped.' };
  const results = [], errors = []; let firstErr = null;
  await Promise.all(queries.map(async q => {
    try { const r = await fcSearch(keys, q, { limit: 10, tbs: settings.recency || undefined }); for (const x of r.web) results.push({ url: x.url, title: x.title || '', description: x.description || '', query: q }); }
    catch (e) { firstErr ||= e; errors.push(`${q.split(' ')[0]}: ${e.message}`); }
  }));
  if (!results.length) {
    if (['rate_limit', 'missing_key', 'bad_key', 'keys_unreadable'].includes(firstErr?.code)) throw firstErr;
    if (errors.length) throw new UserError('Job search failed: ' + errors[0], 502, 'source_failed');
    return { remaining: 0, message: 'Job search found no postings this time.' };
  }
  const jobs = (await extractJobs(keys, settings, results.map(r => `URL: ${r.url}\nTITLE: ${r.title}\nSNIPPET: ${r.description}`).join('\n\n'))).filter(relevantJob);
  const out = await importJobs(jobs, settings, 'Job portals');
  await pushLog({ stage: 'source', message: `Searched ${queries.length} portals, ${results.length} results, ${jobs.length} postings. ${out.summary}` });
  return { remaining: 0, message: `Searched ${queries.length} job portals: ${jobs.length} postings. ${out.summary}`, ...out, warnings: errors };
}
async function extractJobs(keys, settings, text) {
  const prompt = `Extract job postings from these job-board search results (or pasted job-board text). Return a JSON array. Each item: {"company": "hiring company name (from the URL path or title, e.g. boards.greenhouse.io/acme -> Acme)", "title": "job title", "location": "location or empty", "days_ago": number or null, "url": "posting URL or empty", "vendor": true if the hiring company is a consulting firm, staffing or recruiting agency, or a vendor that sells ledger or payments infrastructure to other companies, else false}.
Include EVERY real job posting in the text, and add "relevant": true if the role is about building or running money movement inside the hiring company's own product: ledger, payments, billing, wallets, payouts, money movement, treasury or platform engineering for financial flows, or a reconciliation or financial-operations role; otherwise false. Ignore navigation, filters and match percentages. Use only what the text shows.

TEXT:
${String(text).slice(0, 60000)}`;
  const arr = await claudeJson(keys, prompt, { model: settings.modelFast, maxTokens: 4000 });
  return Array.isArray(arr) ? arr.filter(j => j && j.company && j.title) : [];
}
const relevantJob = j => j.relevant !== false;
export async function importJobs(jobs, settings, sourceLabel) {
  const byCo = new Map();
  for (const j of jobs) { const c = String(j.company).trim(); if (!byCo.has(c)) byCo.set(c, []); byCo.get(c).push(j); }
  let added = 0, updated = 0, known = 0, excluded = 0, capped = 0;
  const addedNames = [], excludedNames = [];
  for (const [company, list] of byCo) {
    const sigs = list.map(j => ({
      type: /reconcil|fin ?ops|financial operations|finance operations|payment operations|treasury analyst/i.test(j.title) ? 'recon_pain' : 'ledger_job',
      quote: String(j.title).slice(0, 160) + (j.location ? ` (${String(j.location).slice(0, 60)})` : ''),
      source: 'feed', origin: 'feed', feed: sourceLabel, url: j.url || '',
      ...(j.tech?.length ? { tech: j.tech } : {}),
      date: (j.days_ago != null && !isNaN(Number(j.days_ago))) ? new Date(Date.now() - Number(j.days_ago) * 864e5).toISOString().slice(0, 10) : today(),
      why: j.tech?.length ? 'open role; mentions ' + j.tech.join(', ') : 'open role'
    }));
    const domain = list.map(j => j.domain).find(Boolean) || '';
    if (list.some(j => j.vendor)) { await register(company, { status: 'excluded', reason: 'Infrastructure vendor, consultancy or staffing firm (from posting)', source: sourceLabel }); excluded++; excludedNames.push(company); continue; }
    const ex = await findExisting(company, domain);
    if (!ex && added >= settings.maxNewCompaniesPerRun) { capped++; continue; }
    const r = await upsertCompany({ name: company, domain, source: sourceLabel, signals: sigs }, settings);
    if (r.status === 'added') { added++; addedNames.push(company); }
    else if (r.status === 'updated') updated++;
    else if (r.status === 'excluded') { excluded++; excludedNames.push(company); }
    else known++;
  }
  const summary = `${added} new companies, ${updated} updated, ${known} already known, ${excluded} excluded${capped ? `, ${capped} held back by the per-run limit` : ''}.`;
  return { added, updated, known, excluded, capped, addedNames, excludedNames, summary };
}
export async function importFeedText(text, label = 'Pasted feed') {
  const [keys, settings] = await Promise.all([getKeys(), getSettings()]);
  text = String(text || '').trim();
  if (text.length < 40) throw new UserError('That text is too short to contain job postings. Copy the whole job list and try again.');
  const all = await extractJobs(keys, settings, text);
  if (!all.length) throw new UserError(`No job postings were found in ${text.length.toLocaleString()} characters of text. Make sure the job list itself was copied (scroll to load it first), not just the page menu.`, 400, 'no_postings');
  const jobs = all.filter(relevantJob);
  const skipped = all.length - jobs.length;
  if (!jobs.length) {
    const message = `${label}: found ${all.length} postings, but none are ledger, payments, billing or finance-operations roles, so nothing was added.`;
    await pushLog({ stage: 'import', message });
    return { postings: all.length, relevant: 0, added: 0, updated: 0, known: 0, excluded: 0, message, summary: 'Nothing relevant.' };
  }
  const out = await importJobs(jobs, settings, label);
  const message = `${label}: ${all.length} postings, ${jobs.length} relevant${skipped ? ` (${skipped} unrelated roles skipped)` : ''}. ${out.summary}`;
  await pushLog({ stage: 'import', message });
  return { postings: all.length, relevant: jobs.length, message, ...out };
}

/* ---------- stage: research ---------- */
async function nextWhere(pred) {
  const all = await listAccounts();
  const hit = Object.entries(all).find(([id, a]) => pred(a, id));
  return { all, hit: hit ? { id: hit[0], a: hit[1] } : null, remaining: Object.entries(all).filter(([id, a]) => pred(a, id)).length };
}
const needsResearch = a => !ICP.blockedStages.includes(a.stage) && (!a.research || Date.now() - Date.parse(a.research.researchedAt) > 30 * 864e5);
export async function stageResearch() {
  const { hit, remaining } = await nextWhere(needsResearch);
  if (!hit) return { remaining: 0, message: 'Every account is researched.' };
  const res = await researchAccount(hit.id);
  return { remaining: remaining - 1, message: `Researched ${hit.a.name}: ${res.summaryLine}`, accountId: hit.id };
}
export async function researchAccount(id) {
  const [keys, settings] = await Promise.all([getKeys(), getSettings()]);
  let a = await getAccount(id); if (!a) throw new UserError('Account not found.', 404);
  const notes = [];
  if (!a.domain) {
    try {
      const r = await fcSearch(keys, `${a.name} official website`, { limit: 6 });
      const h = r.web.map(x => hostOf(x.url)).find(x => x && !BAD_HOSTS.test(x));
      if (h) { a.domain = h; notes.push('website ' + h); }
    } catch (e) { notes.push('website lookup failed'); }
  }
  if (!a.careersUrl) {
    try {
      const r = await fcSearch(keys, `${a.name} careers open jobs`, { limit: 8 });
      const root = (a.domain || '').split('.').slice(-2, -1)[0] || '';
      const hit = r.web.find(x => { const h = hostOf(x.url); return h && /career|job/i.test(x.url + ' ' + (x.title || '')) && (ATS.test(x.url) || (root && h.includes(root))) && !/linkedin|indeed|glassdoor|ziprecruiter/i.test(h); });
      if (hit) { a.careersUrl = hit.url; notes.push('careers page'); }
    } catch (e) { notes.push('careers lookup failed'); }
  }
  const sources = []; let n = 0;
  const add = (kind, url, title, text, date) => { if (url && text) sources.push({ id: 'S' + (++n), kind, url, title: String(title || '').slice(0, 160), date: date || null, text: String(text).slice(0, kind === 'page' ? 12000 : 900) }); };
  const tasks = [
    fcSearch(keys, `"${a.name}" (launches OR raises OR "Series" OR wallet OR payouts OR card OR CTO OR "VP Engineering")`, { limit: 8, news: true, tbs: 'qdr:y' }).then(r => { for (const x of r.news) add('news', x.url, x.title, `${x.title || ''}. ${x.snippet || x.description || ''}`, x.date); for (const x of r.web) add('web', x.url, x.title, `${x.title || ''}. ${x.description || ''}`); }),
    fcSearch(keys, `"${a.name}" ("ledger" OR "double-entry" OR "payments engineer" OR "billing engineer" OR "money movement" OR "reconciliation")`, { limit: 6 }).then(r => { for (const x of r.web) add('jobs', x.url, x.title, `${x.title || ''}. ${x.description || ''}`); })
  ];
  if (a.careersUrl) tasks.push(fcScrape(keys, a.careersUrl).then(t => add('page', a.careersUrl, 'Careers page', t)));
  if (a.newsUrl) tasks.push(fcScrape(keys, a.newsUrl).then(t => add('page', a.newsUrl, 'Newsroom', t)));
  const settled = await Promise.allSettled(tasks);
  const failed = settled.filter(s => s.status === 'rejected');
  if (!sources.length) {
    if (failed.length) throw failed[0].reason;
    await saveAccount(id, { ...a, research: { summary: 'No public sources were found for this company.', stack: { landscape: 'unknown', evidence: '', source: '' }, signals: [], disqualifiers: [], angle: '', sources: [], researchedAt: now() } });
    return { summaryLine: 'nothing found' };
  }
  const known = (a.importedSignals || []).map(x => x.quote).join('; ');
  const sigTypes = Object.entries(ICP.signals).map(([k, v]) => `${k}: ${v.label}`).join('\n');
  const prompt = `You research B2B accounts for Fragment (fragment.dev), which sells a ledger API, plus Payments and Recon, to companies that move money between many parties: marketplaces, brokers, fintechs, billing and creator platforms. Fragment prices per ledger entry. Today is ${today()}.

Company: ${a.name}${a.domain ? ' (' + a.domain + ')' : ''}
Notes: ${a.notes || 'none'}
Open roles already known (do NOT repeat as signals): ${known || 'none'}

Read ONLY the sources below. Every claim must come from a source.

Return ONE JSON object:
{"summary": "2-3 plain sentences on what the company does and how money moves through its product",
 "segment": one of ${ICP.industries.filter(o => o.k).map(o => '"' + o.k + '"').join(',')},
 "revenue": one of ${ICP.revenue.map(o => '"' + o.k + '"').join(',')} (funding stage; only if a source supports it),
 "hq": one of "us","caul","other","",
 "money": one of ${ICP.own.map(o => '"' + o.k + '"').join(',')},
 "stack": {"landscape": one of ${ICP.stack.map(o => '"' + o.k + '"').join(',')}, "evidence": "verbatim quote, at most 25 words, or empty", "source": "S#" or ""},
 "signals": [{"type": signal key, "quote": "verbatim, at most 25 words", "source": "S#", "date": "YYYY-MM-DD or null", "why": "one short line"}],
 "disqualifiers": ["short reason"] (consultancy or staffing firm; sells ledger or payments infrastructure itself; shut down or acquired; no money movement in the product),
 "outreach_angle": "one line"}

Stage bands: seed, ab (Series A or B), growth (Series C or later, private), public, tiny (no funding or no product).
Segments: ${ICP.industries.filter(o => o.k).map(o => o.k + ' = ' + o.label).join('; ')}.
Ledger stack: "homegrown_strain" only with evidence of an in-house ledger causing problems or being rebuilt; "app_db" when balances live in the app database or spreadsheets; "greenfield" when a money product is launching without a ledger mentioned; "psp_only" when they rely on Stripe or a bank partner for balances; "homegrown_ok" for a mature in-house ledger team; "vendor" if they use another ledger vendor; "unknown" when no source shows it.
Signal keys:
${sigTypes}
Rules: only signals clearly about ${a.name} itself; at most 6, strongest first.

SOURCES:
${sources.map(x => `[${x.id}] (${x.kind}${x.date ? ', ' + x.date : ''}) ${x.url}\n${x.text}`).join('\n\n')}`;
  const out = await claudeJson(keys, prompt, { model: settings.modelSmart, maxTokens: 2500 });
  const valid = new Set(sources.map(x => x.id));
  const signals = (Array.isArray(out.signals) ? out.signals : []).filter(x => x && ICP.signals[x.type] && valid.has(x.source) && x.quote).slice(0, 6)
    .map(x => ({ type: x.type, quote: String(x.quote).slice(0, 300), source: x.source, date: /^\d{4}-\d{2}-\d{2}$/.test(x.date || '') ? x.date : null, why: String(x.why || '').slice(0, 200) }));
  a = { ...(await getAccount(id)), domain: a.domain, careersUrl: a.careersUrl };
  a.research = {
    summary: String(out.summary || '').slice(0, 800),
    stack: { landscape: ICP.stack.some(o => o.k === out.stack?.landscape) ? out.stack.landscape : 'unknown', evidence: String(out.stack?.evidence || '').slice(0, 300), source: valid.has(out.stack?.source) ? out.stack.source : '' },
    signals, disqualifiers: (Array.isArray(out.disqualifiers) ? out.disqualifiers : []).map(String).slice(0, 4),
    angle: String(out.outreach_angle || '').slice(0, 300), sources: sources.map(({ text, ...r }) => r), researchedAt: now()
  };
  if (!a.industry && ICP.industries.some(o => o.k && o.k === out.segment)) a.industry = out.segment;
  if (!a.revenue && ICP.revenue.some(o => o.k && o.k === out.revenue)) a.revenue = out.revenue;
  if (!a.geo && ICP.geo.some(o => o.k && o.k === out.hq)) a.geo = out.hq;
  if (!a.ownership && ICP.own.some(o => o.k && o.k === out.money)) a.ownership = out.money;
  if (!a.stage || a.stage === 'New') a.stage = 'Researching';
  await saveAccount(id, a);
  const sc = score(a);
  const line = `tier ${sc.tier || '-'}, fit ${sc.fit}, timing ${Math.round(sc.timing)}, ${signals.length} new signals${notes.length ? ' (' + notes.join(', ') + ')' : ''}`;
  await pushLog({ stage: 'research', message: `${a.name}: ${line}` });
  return { summaryLine: line };
}

/* ---------- stage: competitors ---------- */
const needsCompetitors = a => !a.competitorOf && !a.competitorsDone && a.research && score(a).fit >= 35 && !ICP.blockedStages.includes(a.stage);
export async function stageCompetitors() {
  const settings = await getSettings();
  if (!settings.competitorsPerAccount) return { remaining: 0, message: 'Competitor search is off in Settings.' };
  const { hit, remaining } = await nextWhere(needsCompetitors);
  if (!hit) return { remaining: 0, message: 'No accounts are waiting for a competitor search.' };
  const keys = await getKeys();
  const a = hit.a, sc = score(a);
  const indLabel = (ICP.industries.find(o => o.k === a.industry) || {}).label || 'unknown industry';
  const revLabel = (ICP.revenue.find(o => o.k === a.revenue) || {}).label || 'unknown stage';
  let snippets = '';
  try {
    const r = await fcSearch(keys, `${a.name} competitors similar companies`, { limit: 8 });
    snippets = r.web.map(x => `${x.title || ''}: ${x.description || ''} (${x.url})`).join('\n');
  } catch (e) { snippets = ''; }
  const reg = await listRegistry();
  const knownNames = Object.values(reg).map(r => r.name).slice(0, 400).join('; ');
  const prompt = `List direct competitors of ${a.name} (${a.domain || 'domain unknown'}). ${a.name} is in ${indLabel}, stage ${revLabel}. Summary: ${a.research?.summary || 'none'}

Pick companies that sell similar products to similar customers AND are at a similar stage (same funding band or one either side), and whose product moves money between parties (payouts, balances, cards, wallets, billing). Exclude consultancies, staffing firms, ledger or payments infrastructure vendors, and these existing Fragment customers: ${CUSTOMERS.join(', ')}.
Do not include any of these companies, which are already known: ${knownNames || 'none'}.

Search results that may help:
${snippets || 'none'}

Return a JSON array of up to ${settings.competitorsPerAccount} items: [{"name": "...", "domain": "example.com or empty", "why": "one line on why it's a similar-scale competitor"}]. Use real companies only; if unsure, return fewer.`;
  let list = [];
  try { list = await claudeJson(keys, prompt, { model: settings.modelSmart, maxTokens: 1200 }); } catch (e) { list = []; }
  const names = [];
  for (const c of (Array.isArray(list) ? list : []).slice(0, settings.competitorsPerAccount)) {
    if (!c?.name) continue;
    const r = await upsertCompany({ name: c.name, domain: c.domain || '', source: `Competitor of ${a.name}`, competitorOf: a.name, fields: { notes: c.why ? `Competitor of ${a.name}: ${c.why}` : '', industry: a.industry || '' } }, settings);
    if (r.status === 'added') names.push(c.name);
  }
  await saveAccount(hit.id, { ...(await getAccount(hit.id)), competitorsDone: true });
  await pushLog({ stage: 'competitors', message: `${a.name}: ${names.length ? 'added ' + names.join(', ') : 'no new competitors'}` });
  return { remaining: remaining - 1, message: `Competitors of ${a.name}: ${names.length ? names.join(', ') : 'none new'}`, added: names.length, tier: sc.tier };
}

/* ---------- stage: people ---------- */
const needsPeople = a => !a.peopleDone && a.research && score(a).tier === '1';
export async function stagePeople() {
  const { hit, remaining } = await nextWhere(needsPeople);
  if (!hit) return { remaining: 0, message: 'Every Tier 1 account has people slots.' };
  const keys = await getKeys();
  const a = hit.a;
  let found = [], via = 'placeholders';
  if (keys.apollo && a.domain) {
    try {
      const titles = [...new Set(DEFAULT_SLOTS.flatMap(r => PERSONAS[r].titles))];
      const people = await apolloPeopleSearch(keys, { domain: a.domain, titles, perPage: 10 });
      const taken = new Set();
      for (const role of DEFAULT_SLOTS) {
        const p = people.find(x => !taken.has(x.apolloId) && roleFor(x.title) === role);
        if (p) { taken.add(p.apolloId); found.push({ ...p, role, placeholder: false, email: '', emailStatus: '', source: 'Apollo', addedAt: now() }); }
      }
      via = 'Apollo';
    } catch (e) { via = 'placeholders (Apollo: ' + e.message.slice(0, 80) + ')'; }
  }
  const contacts = [...(a.contacts || [])];
  const haveRoles = new Set(contacts.filter(c => !c.placeholder).map(c => c.role));
  for (const p of found) if (!haveRoles.has(p.role)) { contacts.push(p); haveRoles.add(p.role); }
  for (const role of DEFAULT_SLOTS) if (!haveRoles.has(role) && !contacts.some(c => c.placeholder && c.role === role)) contacts.push({ placeholder: true, role, name: '', title: '', email: '', addedAt: now() });
  await saveAccount(hit.id, { ...(await getAccount(hit.id)), contacts, peopleDone: true });
  await pushLog({ stage: 'people', message: `${a.name}: ${found.length} people from ${via}` });
  return { remaining: remaining - 1, message: `${a.name}: ${found.length ? found.length + ' people found via ' + via : 'people slots added for manual entry'}` };
}

/* ---------- stage: emails ---------- */
export async function findEmailFor(id, idx) {
  const keys = await getKeys();
  const a = await getAccount(id); const c = a?.contacts?.[idx];
  if (!c || c.placeholder) throw new UserError('Contact not found.', 404);
  let r = null, via = '';
  if (keys.apollo) { r = await apolloMatch(keys, { apolloId: c.apolloId, name: c.name, domain: a.domain, company: a.name, linkedin: c.linkedin }); via = 'Apollo'; }
  if ((!r || !r.email) && keys.hunter && a.domain) { r = await hunterFind(keys, { name: c.name, domain: a.domain }); via = 'Hunter'; }
  if (!via) throw new UserError('Add an Apollo or Hunter API key in Settings to look up emails.', 400, 'missing_key');
  const contacts = [...a.contacts];
  contacts[idx] = { ...c, email: r.email || c.email || '', emailStatus: r.email ? (r.status || 'from ' + via) : 'not found', linkedin: c.linkedin || r.linkedin || '', emailLookedUp: now() };
  await saveAccount(id, { ...a, contacts });
  return { email: r.email, status: r.status, via };
}
const wantsEmail = c => !c.placeholder && c.name && !c.email && !c.emailLookedUp;
export async function stageEmails(used = 0) {
  const settings = await getSettings();
  if (!settings.autoFindEmails) return { remaining: 0, message: 'Automatic email lookup is off in Settings.' };
  if (used >= settings.maxEmailLookupsPerRun) return { remaining: 0, message: `Reached the per-run limit of ${settings.maxEmailLookupsPerRun} email lookups.` };
  const all = await listAccounts();
  const todo = [];
  for (const [id, a] of Object.entries(all)) if (score(a).tier === '1') (a.contacts || []).forEach((c, i) => { if (wantsEmail(c)) todo.push({ id, i, a, c }); });
  if (!todo.length) return { remaining: 0, message: 'No contacts are waiting for an email.' };
  const t = todo[0];
  try { const r = await findEmailFor(t.id, t.i); return { remaining: todo.length - 1, used: used + 1, message: `${t.c.name} at ${t.a.name}: ${r.email || 'no email found'} (${r.via})` }; }
  catch (e) {
    if (e.code === 'missing_key') return { remaining: 0, message: e.message };
    const a = await getAccount(t.id); a.contacts[t.i] = { ...a.contacts[t.i], emailLookedUp: now(), emailStatus: 'lookup failed' }; await saveAccount(t.id, a);
    return { remaining: todo.length - 1, used: used + 1, message: `${t.c.name}: ${e.message}` };
  }
}

/* ---------- stage: drafts ---------- */
export async function draftFor(id, idx, fmtN) {
  const [keys, settings] = await Promise.all([getKeys(), getSettings()]);
  if (!settings.sender.name) throw new UserError('Add the sender name in Settings first, so drafts are signed correctly.', 400, 'missing_sender');
  const a = await getAccount(id); const c = a?.contacts?.[idx];
  if (!c || c.placeholder) throw new UserError('Contact not found.', 404);
  const sc = score(a), n = Number(fmtN) || pickFormat(a, sc), fmt = FORMATS[n];
  const sig = sc.signals.find(x => x.format === n) || sc.signals[0] || null;
  const sigUrl = sig ? (sig.url || (a.research?.sources || []).find(z => z.id === sig.source)?.url || '') : '';
  const persona = PERSONAS[c.role] || PERSONAS.user, first = String(c.name).trim().split(/\s+/)[0], s = settings.sender;
  const prompt = `Write a first cold email from a Fragment founder. Return ONE JSON object: {"subject": "...", "body": "..."}.

Use this format as the structure. Fill every {{field}} with real details; never leave a {{field}} or bracket in the output. Keep the shape: signal first, one value sentence, one proof point, one easy question.

FORMAT ${n} (${fmt.name})
Subject: ${fmt.subject}
Body:
${fmt.body}

RULES
- Under 100 words in the body. Plain text, no links, no bullets, no exclamation marks.
- Short lowercase subject line. No "Re:" or "Fwd:".
- The first line is about them and names the signal specifically.
- At most ONE proof point, only from: ${PROOF.join(' | ')}.
- Do not invent facts, numbers, customers or familiarity.
- If the format mentions a launch, use the real product name from the signal; if there is none, rewrite that line around the signal you have.
- Fit the value sentence to the reader (${persona.label}): "${persona.value}"
- End with just the sender's first name: ${s.name}. No footer.

DETAILS
Recipient: ${c.name} (first name ${first}), ${c.title || 'title unknown'}
Company: ${a.name}
Industry use case: ${sc.useCase}
Signal: ${sig ? `${sig.label}. Quote: "${sig.quote}"${sig.date ? ' (' + sig.date + ')' : ''}` : 'none; keep the opening honest and general'}
Ledger stack evidence: ${a.research?.stack?.evidence || 'none'}
Summary: ${a.research?.summary || 'none'}
Angle: ${a.research?.angle || 'none'}
Notes: ${a.notes || 'none'}`;
  const out = await claudeJson(keys, prompt, { model: settings.modelSmart, maxTokens: 900 });
  if (!out?.subject || !out?.body) throw new UserError("Claude's draft was incomplete. Try again.", 502);
  const body = String(out.body).trim() + `\n${s.title ? s.title + ', ' : ''}Fragment` + (s.footer ? `\n\n${s.footer.trim()}` : '');
  const fresh = await getAccount(id); const contacts = [...fresh.contacts];
  contacts[idx] = { ...contacts[idx], draft: { subject: String(out.subject).trim(), body, format: n, status: 'Draft', signalQuote: sig?.quote || '', signalUrl: sigUrl, createdAt: now() } };
  await saveAccount(id, { ...fresh, contacts });
  return contacts[idx].draft;
}
export async function stageDrafts() {
  const settings = await getSettings();
  if (!settings.autoDraft) return { remaining: 0, message: 'Automatic drafting is off in Settings.' };
  if (!settings.sender.name) return { remaining: 0, message: 'Drafting skipped: add the sender name in Settings.' };
  const all = await listAccounts(), todo = [];
  for (const [id, a] of Object.entries(all)) if (score(a).tier === '1') (a.contacts || []).forEach((c, i) => { if (!c.placeholder && c.email && !c.draft) todo.push({ id, i, a, c }); });
  if (!todo.length) return { remaining: 0, message: 'No contacts are waiting for a draft.' };
  const t = todo[0];
  await draftFor(t.id, t.i);
  return { remaining: todo.length - 1, message: `Drafted an email to ${t.c.name} at ${t.a.name}` };
}

/* ---------- sending ---------- */
export async function sendApproved({ id, idx } = {}) {
  const [keys, settings] = await Promise.all([getKeys(), getSettings()]);
  if (!settings.sender.footer || !/unsubscribe|opt.?out|reply .?no|not relevant|stop/i.test(settings.sender.footer)) throw new UserError('Add an email footer with your mailing address and an opt-out line in Settings before sending.', 400, 'missing_footer');
  const sentToday = (await hget('meta', 'sent:' + today())) || 0;
  const optOut = new Set((settings.optOut || []).map(x => String(x).toLowerCase().trim()));
  const all = await listAccounts(), queue = [];
  for (const [aid, a] of Object.entries(all)) {
    if (ICP.blockedStages.includes(a.stage)) continue;
    (a.contacts || []).forEach((c, i) => {
      if (id && (aid !== id || i !== Number(idx))) return;
      if (c.email && c.draft?.status === 'Approved') queue.push({ aid, i });
    });
  }
  if (!queue.length) return { sent: 0, skipped: 0, message: id ? 'That draft is not approved yet.' : 'No approved drafts to send.' };
  let sent = 0, skipped = 0; const errors = [];
  for (const q of queue) {
    if (sentToday + sent >= settings.email.dailyCap) { errors.push(`Daily cap of ${settings.email.dailyCap} reached; the rest stay approved for tomorrow.`); break; }
    const a = await getAccount(q.aid); const c = a.contacts[q.i];
    if (optOut.has(String(c.email).toLowerCase()) || optOut.has(String(c.email).split('@')[1]?.toLowerCase())) { skipped++; a.contacts[q.i] = { ...c, draft: { ...c.draft, status: 'Blocked: opted out' } }; await saveAccount(q.aid, a); continue; }
    try {
      const r = await sendEmail(keys, settings, { to: c.email, subject: c.draft.subject, text: c.draft.body });
      a.contacts[q.i] = { ...c, draft: { ...c.draft, status: 'Sent', sentAt: now(), messageId: r.id } };
      if (!a.stage || ['New', 'Researching'].includes(a.stage)) a.stage = 'Contacted';
      await saveAccount(q.aid, a); sent++;
    } catch (e) { errors.push(`${c.name}: ${e.message}`); if (['no_provider', 'missing_key', 'missing_sender', 'bad_key'].includes(e.code)) break; }
  }
  if (sent) await hset('meta', 'sent:' + today(), sentToday + sent);
  await pushLog({ stage: 'send', message: `Sent ${sent}, skipped ${skipped}${errors.length ? '. ' + errors[0] : ''}` });
  return { sent, skipped, errors, message: `Sent ${sent} email${sent === 1 ? '' : 's'}${skipped ? `, skipped ${skipped} opted out` : ''}.` };
}

export const STAGES = { source: stageSource, research: stageResearch, competitors: stageCompetitors, people: stagePeople, emails: stageEmails, drafts: stageDrafts };

/* ---------- bulk import (CSV/JSON rows) and the one-time starting data ---------- */
const ROW_FIELDS = ['name', 'domain', 'industry', 'revenue', 'geo', 'ownership', 'stackOverride', 'stage', 'careersUrl', 'newsUrl', 'owner', 'notes'];
export async function importRowsData(rows, settings) {
  let added = 0, known = 0, excluded = 0;
  for (const row of (rows || []).slice(0, 500)) {
    const r = await upsertCompany({ name: row.name, domain: row.domain || '', source: row.source || 'Imported', fields: Object.fromEntries(ROW_FIELDS.filter(k => row[k]).map(k => [k, row[k]])) }, settings);
    if (r.status === 'added') {
      added++;
      const extra = {};
      if (Array.isArray(row.contacts)) extra.contacts = row.contacts;
      if (row.research) extra.research = row.research;
      if (Array.isArray(row.importedSignals)) extra.importedSignals = row.importedSignals;
      for (const k of ['competitorOf', 'competitorsDone', 'peopleDone']) if (row[k] != null) extra[k] = row[k];
      if (Object.keys(extra).length) { const a = await getAccount(r.id); await saveAccount(r.id, { ...a, ...extra }); }
    } else if (r.status === 'excluded') excluded++; else known++;
  }
  return { added, known, excluded };
}
export async function ensureSeed() {
  if (process.env.DD_SKIP_SEED) return null;
  if (await hget('meta', 'seeded')) return null;
  await hset('meta', 'seeded', now());
  const rows = (await import('./seed.js')).default;
  const out = await importRowsData(rows, await getSettings());
  await pushLog({ stage: 'import', message: `Loaded the starting accounts: ${out.added} added, ${out.known} already here.` });
  return out;
}
