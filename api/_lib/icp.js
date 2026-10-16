// Fragment ICP, scoring, email formats and personas. Edit here to retune the model.
// Built from Fragment's public positioning (Series A announcement, Oct 14, 2026: "turn agents into financial operators"):
// a ledger API that enforces double-entry correctness, plus Payments and Recon, sold to vertical AI companies automating
// their customers' billing, payments and accounting, and to fintechs and digital platforms with multi-directional fund flows.
// Buyers are engineering and product teams. Hiring is deliberately not a signal.
export const ICP = {
  // Segment. 15 points. The use case drives the email.
  industries: [
    { k: 'agentic', label: 'Vertical AI or agentic commerce (agents that bill, pay or account)', pts: 15, useCase: "agent-run billing, payments and accounting for their customers" },
    { k: 'spend', label: 'Corporate cards and spend management', pts: 15, useCase: 'card balances, rebates, credits and spend controls' },
    { k: 'finsw', label: 'Financial software (AP/AR, billing, accounting platforms)', pts: 15, useCase: 'payables, receivables and money movement for their customers' },
    { k: 'market', label: 'Digital marketplace or platform with payouts', pts: 15, useCase: 'split payments, seller payouts and platform fees' },
    { k: 'xb', label: 'Cross-border payments, remittance or logistics fintech', pts: 15, useCase: 'multi-currency balances, FX, fuel and freight payments' },
    { k: 'billing', label: 'B2B SaaS moving to automated or usage-based billing', pts: 12, useCase: 'usage billing, credits and prepaid balances' },
    { k: 'fin_other', label: 'Other fintech (lending, brokerage, wallets)', pts: 10, useCase: 'balances, accruals and transfers' },
    { k: 'adj', label: 'Adjacent (insurance, energy, healthcare, government payments)', pts: 6, useCase: 'premiums, credits and payouts' },
    { k: 'other', label: 'Other', pts: 0, useCase: 'balances and money movement' },
    { k: '', label: 'Unknown', pts: 0, useCase: 'balances and money movement' }
  ],
  // Stage. Stored in the `revenue` field. 10 points. High-growth companies first.
  revenue: [
    { k: 'ab', label: 'Series A to C, high growth', pts: 10 },
    { k: 'growth', label: 'Late-stage private', pts: 9 },
    { k: 'seed', label: 'Seed, fast-growing (common in agentic AI)', pts: 6 },
    { k: 'public', label: 'Public or very large', pts: 4 },
    { k: 'tiny', label: 'Pre-product or no funding', pts: 0, disq: true },
    { k: '', label: 'Unknown', pts: 5, unconfirmed: true }
  ],
  geo: [
    { k: 'us', label: 'United States', pts: 5 }, { k: 'caul', label: 'Canada, UK or EU', pts: 3 },
    { k: 'other', label: 'Other', pts: 1 }, { k: '', label: 'Unknown', pts: 0 }
  ],
  // Money movement complexity. Stored in the `ownership` field. 5 points.
  own: [
    { k: 'multi', label: 'Multi-directional fund flows (payer, payee, platform)', pts: 5 },
    { k: 'fx', label: 'Multi-currency or cross-border', pts: 5 },
    { k: 'volume', label: 'High volume, simple flows', pts: 3 },
    { k: 'single', label: 'Single-party, low volume', pts: 0 }, { k: '', label: 'Unknown', pts: 0 }
  ],
  // Technology fit: how far the company is moving toward automated, agent-run money. Stored as `stack`. 15 points.
  stack: [
    { k: 'agents_live', label: 'AI agents already moving money or writing financial code', pts: 15 },
    { k: 'automating', label: 'Moving to automated billing or algorithmic payments', pts: 14 },
    { k: 'homegrown_strain', label: 'Homegrown ledger showing strain', pts: 13 },
    { k: 'app_db', label: 'Balances in the app database or spreadsheets', pts: 11 },
    { k: 'greenfield', label: 'Launching money movement, no ledger yet', pts: 10 },
    { k: 'psp_only', label: 'Relying on Stripe or bank-partner balances only', pts: 8 },
    { k: 'homegrown_ok', label: 'Mature in-house ledger team', pts: 4 },
    { k: 'vendor', label: 'On another ledger vendor', pts: 3 },
    { k: 'unknown', label: 'Not found', pts: 0 }
  ],
  // Timing signals. Hiring is not used.
  signals: {
    agent_launch: { label: 'Launched AI agents that move money, bill or account', w: 25, hl: 90, format: 1 },
    money_launch: { label: 'New money product (wallet, payouts, card, credits, billing)', w: 22, hl: 90, format: 3 },
    funding: { label: 'New funding round', w: 20, hl: 90, format: 2 },
    automation_move: { label: 'Public move to automated billing or algorithmic payments', w: 18, hl: 120, format: 1 },
    ledger_strain: { label: 'Public write-up or incident on balances, reconciliation or ledger', w: 15, hl: 180, format: 4 },
    expansion: { label: 'New market, currency or payment rail', w: 15, hl: 120, format: 3 },
    new_leader: { label: 'New CTO, VP Engineering, Head of Payments or Product', w: 12, hl: 90, format: 2 }
  },
  stages: ['New', 'Researching', 'Contacted', 'Replied', 'Meeting set', 'Open deal', 'Customer', 'Not now', 'Opted out'],
  blockedStages: ['Open deal', 'Customer', 'Opted out']
};

// Ledger vendors, infrastructure partners, banks, investors, consultancies and staffing firms are excluded.
export const EXCLUDE_RE = /\bfragment\b|modern treasury|formance|tigerbeetle|\btwisp\b|\bblnk\b|\bledgible\b|\bstripe\b|accenture|deloitte|kpmg|\bpwc\b|pricewaterhouse|ernst & young|\bey\b|thoughtworks|toptal|staffing|consult|recruit|robert half|insight global|teksystems|randstad|kforce|\bventures\b|\bcapital partners\b/i;
// Customers named on Fragment's site and in press coverage. Kept out of outreach.
export const CUSTOMERS = ['Ramp', 'Whop', 'BILL', 'Bill.com', 'Pleo', 'AtoB', 'Nala', 'TruckSmarter', 'Basic Capital', 'Odyssey', 'Nomos'];
export const CUSTOMER_RE = new RegExp('^(' + CUSTOMERS.map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(\\b|$)', 'i');

export const FORMATS = {
  1: { name: 'Agents or automation touching money', subject: 'agents and money at {{company}}', body: "Hi {{first_name}},\n\nSaw {{signal_detail}}. Once agents start running {{industry_use_case}}, the hard part stops being the model and becomes keeping every balance correct.\n\nFragment is a ledger API that enforces double-entry rules, so the numbers have to balance before money moves. Ramp uses it to keep its coding agents from shipping financial code that doesn't add up.\n\nWould it help to see how teams let agents build money flows on Fragment without breaking them?\n\n{{sender_first_name}}" },
  2: { name: 'New round or new leader', subject: 'money movement at {{company}}', body: "Hi {{first_name}},\n\nCongrats on {{signal_detail}}. That's usually when the roadmap fills up with new ways to charge, pay out and hold balances.\n\nFragment gives engineering and product a ledger API for those flows, with Payments and Recon on the same records. Ramp, BILL and Whop build on it.\n\nWorth a short look at what the next money product would take on Fragment?\n\n{{sender_first_name}}" },
  3: { name: 'New money product or expansion', subject: '{{launch}} at {{company}}', body: "Hi {{first_name}},\n\nSaw the launch of {{launch}}. Products like that multiply the balances a team has to keep correct: {{industry_use_case}}.\n\nFragment is a ledger API made for this, and its MCP server lets agents write the financial code without breaking it. Teams start free on 1,000 entries a month.\n\nWould a model of {{launch}} in Fragment be useful?\n\n{{sender_first_name}}" },
  4: { name: 'Reconciliation or ledger strain', subject: 'reconciliation at {{company}}', body: "Hi {{first_name}},\n\nNoticed {{signal_detail}}. That usually means balances in the product and in the bank drift apart, and people close the gap by hand.\n\nFragment keeps the ledger, payments and reconciliation on one set of records, so the gap closes in the system rather than in a spreadsheet. Pleo and BILL use it.\n\nIs reconciliation taking more of the team's time this year?\n\n{{sender_first_name}}" }
};

export const PERSONAS = {
  champion: { label: 'Champion, payments engineering', value: 'A ledger API that handles balances, idempotency and consistency, so the team stops maintaining money code.', titles: ['Head of Payments', 'Engineering Manager Payments', 'Staff Engineer Payments', 'Payments Engineering Lead', 'Head of Platform Engineering'], search: 'Head of Payments, payments or ledger engineering lead, platform engineering manager', kw: 'payments engineering ledger' },
  econ_it: { label: 'Economic buyer, engineering', value: 'Agents and engineers ship money flows fast while the ledger guarantees the numbers balance, on infrastructure Ramp and Whop already run on.', titles: ['Chief Technology Officer', 'CTO', 'VP Engineering', 'Head of Engineering', 'Co-Founder'], search: 'CTO, VP Engineering, technical co-founder', kw: 'CTO VP Engineering' },
  econ_fin: { label: 'Economic buyer, finance', value: 'Balances, payments and reconciliation on one set of records, so close stops depending on spreadsheets.', titles: ['Chief Financial Officer', 'CFO', 'VP Finance', 'Head of Finance'], search: 'CFO, VP Finance, Head of Finance', kw: 'CFO VP Finance' },
  product: { label: 'Product owner', value: 'Launch new ways to charge, pay out and hold value, including agent-run billing, without waiting on a ledger rebuild.', titles: ['Head of Product', 'Product Manager Payments', 'VP Product'], search: 'Head of Product, payments product manager', kw: 'product manager payments' },
  controller: { label: 'Controller or finance ops', value: 'Reconciliation runs in the system, with every entry traceable for audit.', titles: ['Controller', 'Head of Financial Operations', 'Finance Operations Manager'], search: 'Controller, Head of FinOps, finance operations', kw: 'financial operations reconciliation' },
  gatekeeper: { label: 'Technical gatekeeper', value: 'SOC 2 and HIPAA certified, API-first, with an MCP server for agent-written code.', titles: ['Security Engineer', 'Principal Architect', 'Head of Compliance'], search: 'Security, architecture or compliance lead', kw: 'security architect compliance' },
  user: { label: 'Engineer or operator', value: 'Fewer balance bugs and less manual reconciliation.', titles: ['Software Engineer', 'Payments Operations'], search: 'Payments engineer or operator', kw: 'payments engineer' }
};
export const DEFAULT_SLOTS = ['champion', 'econ_it', 'product'];

// Only facts from Fragment's public site. Drafts may use at most one.
export const PROOF = ['Ramp, BILL and Whop build on Fragment', 'Ramp shipped its guest travel product in under 30 days on Fragment', 'Double-entry rules are enforced, so numbers must balance before money moves', 'MCP server so agents can write financial code safely', 'Ledgers, Payments and Recon on one set of records', 'Backed by Stripe, FirstMark and BoxGroup; $12M Series A in October 2026', 'SOC 2 and HIPAA certified', 'Free plan with 1,000 ledger entries a month'];

export const slug = x => String(x || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 120);
export const normDomain = d => String(d || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[\/?#]/)[0];
export const docId = (domain, name) => { const d = normDomain(domain); return d ? d.replace(/[^a-z0-9_\-.~]/g, '-').slice(0, 180) : ('co-' + (slug(name) || Date.now())); };
export const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
export const today = () => new Date().toISOString().slice(0, 10);
const find = (list, k) => list.find(o => o.k === (k || '')) || list[list.length - 1];
const daysSince = d => { const t = Date.parse(d); return isNaN(t) ? null : Math.max(0, Math.round((Date.now() - t) / 864e5)); };

export function roleFor(title) {
  const t = String(title || '').toLowerCase();
  if (/\bcfo\b|chief financial|vp,? finance|vice president,? finance|head of finance/.test(t)) return 'econ_fin';
  if (/controller|comptroller|fin ?ops|financial operations|finance operations|reconciliation/.test(t)) return 'controller';
  if (/\bcto\b|chief technology|vp,? engineering|vice president,? engineering|head of engineering|co-?founder/.test(t)) return 'econ_it';
  if (/security|architect|compliance|\bgrc\b/.test(t)) return 'gatekeeper';
  if (/payment|ledger|billing|money movement|platform|treasury/.test(t) && /engineer|lead|head|manager|director|staff|principal/.test(t)) return 'champion';
  if (/product/.test(t)) return 'product';
  return 'user';
}

export function score(a) {
  const ind = find(ICP.industries, a.industry), rev = find(ICP.revenue, a.revenue), geo = find(ICP.geo, a.geo), own = find(ICP.own, a.ownership);
  const stackKey = a.stackOverride || a.research?.stack?.landscape || 'unknown';
  const stack = ICP.stack.find(o => o.k === stackKey) || ICP.stack[ICP.stack.length - 1];
  const fit = ind.pts + rev.pts + geo.pts + own.pts + stack.pts;
  const sigs = [...(a.importedSignals || []), ...(a.research?.signals || [])].map(s => {
    const def = ICP.signals[s.type]; if (!def) return null;
    const age = s.date ? daysSince(s.date) : null;
    const cur = def.w * Math.pow(0.5, (age == null ? 45 : age) / def.hl);
    return { ...s, label: def.label, weight: def.w, format: def.format, age, cur: Math.round(cur * 10) / 10 };
  }).filter(Boolean).sort((x, y) => y.cur - x.cur);
  const timing = Math.min(50, sigs.reduce((t, s) => t + s.cur, 0));
  let tier = null;
  if (ICP.blockedStages.includes(a.stage)) tier = 'blocked';
  else if (rev.disq) tier = 'out';
  else if (a.research || (a.importedSignals || []).length) {
    if (fit >= 35 && timing >= 20) tier = '1'; else if (fit >= 35) tier = '2'; else if (timing >= 20) tier = '3'; else tier = 'out';
  }
  return {
    fit, timing: Math.round(timing * 10) / 10, tier, signals: sigs, useCase: ind.useCase,
    parts: [['Segment', ind.label, ind.pts, 15], ['Technology fit', stack.label, stack.pts, 15], ['Funding stage', rev.label + (rev.unconfirmed ? ' (unconfirmed)' : ''), rev.pts, 10], ['HQ', geo.label, geo.pts, 5], ['Money movement', own.label, own.pts, 5]]
  };
}

export function pickFormat(a, sc) {
  if (sc.signals[0]) return sc.signals[0].format;
  const k = a.stackOverride || a.research?.stack?.landscape;
  if (k === 'agents_live' || k === 'automating') return 1;
  return (k === 'homegrown_strain' || k === 'app_db') ? 4 : 2;
}
