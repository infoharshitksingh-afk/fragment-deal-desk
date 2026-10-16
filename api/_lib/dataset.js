// The company dataset: every mention of a company found while crawling sources or searching the news,
// kept with its source and date. Research reads it first, so known facts don't cost another search.
// Also counts which unregistered domains keep producing good companies, to suggest new sources.
import { hget, hset, hgetall } from './store.js';
import { slug } from './icp.js';

const MAX_MENTIONS = 30;

export async function recordMention(company, m) {
  const key = slug(company); if (!key) return;
  const cur = (await hget('mentions', key)) || [];
  const dupe = cur.some(x => x.quote === m.quote && x.sourceId === m.sourceId);
  if (dupe) return;
  const next = [{ ...m, at: new Date().toISOString() }, ...cur].slice(0, MAX_MENTIONS);
  await hset('mentions', key, next);
}
export async function getMentions(company) { return (await hget('mentions', slug(company))) || []; }

// Exploration: which domains (outside the registry) keep turning up companies that fit.
export async function recordDomain(domain, company, fit) {
  if (!domain || !company) return;
  const cur = (await hget('domains', domain)) || { domain, companies: [], fit: [] };
  const c = String(company).trim();
  if (!cur.companies.includes(c)) cur.companies = [...cur.companies, c].slice(-60);
  if (fit && !cur.fit.includes(c)) cur.fit = [...cur.fit, c].slice(-60);
  cur.lastSeen = new Date().toISOString();
  await hset('domains', domain, cur);
}
export const listDomains = () => hgetall('domains');
