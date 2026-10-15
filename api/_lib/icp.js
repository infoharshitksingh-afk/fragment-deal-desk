// Fragment ICP, scoring, email formats and personas. Edit here to retune the model.
// Built from Fragment's public positioning: a ledger API (plus Payments and Recon) for companies that move
// money between many parties, used by marketplaces, brokers and fintechs (customers page), priced per ledger entry.
export const ICP = {
  // Segment: what kind of money the company moves. 15 points.
  industries: [
    { k: 'market', label: 'Marketplace or platform with payouts', pts: 15, useCase: 'split payments, seller and driver payouts, and platform fees' },
    { k: 'spend', label: 'Cards, spend management or wallets', pts: 15, useCase: 'card balances, rewards, credits and multi-currency wallets' },
    { k: 'invest', label: 'Brokerage, wealth or retirement', pts: 15, useCase: 'customer cash, position balances and transfers' },
    { k: 'billing', label: 'Usage billing, creator or commerce platform', pts: 15, useCase: 'usage billing, credits, balances and creator payouts' },
    { k: 'lend', label: 'Lending, BNPL or earned wage access', pts: 13, useCase: 'loan balances, accruals, fees and repayments' },
    { k: 'vsaas', label: 'Vertical SaaS adding embedded payments', pts: 12, useCase: 'embedded payments, payouts and reconciliation' },
    { k: 'xb', label: 'Cross-border payments or remittance', pts: 12, useCase: 'multi-currency balances, FX and settlement' },
    { k: 'adj', label: 'Adjacent (insurance, energy, healthcare payments)', pts: 8, useCase: 'premiums, credits and payouts' },
    { k: 'other', label: 'Other', pts: 0, useCase: 'balances and money movement' },
    { k: '', label: 'Unknown', pts: 0, useCase: 'balances and money movement' }
  ],
  // Stage and scale. Stored in the `revenue` field. 10 points.
  revenue: [
    { k: 'ab', label: 'Series A to B', pts: 10 },
    { k: 'growth', label: 'Series C and later, private', pts: 9 },
    { k: 'public', label: 'Public or very large', pts: 5 },
    { k: 'seed', label: 'Seed (free plan territory)', pts: 3 },
    { k: 'tiny', label: 'Pre-product or no funding', pts: 0, disq: true },
    { k: '', label: 'Unknown', pts: 5, unconfirmed: true }
  ],
  geo: [
    { k: 'us', label: 'United States', pts: 5 }, { k: 'caul', label: 'Canada, UK or EU', pts: 3 },
    { k: 'other', label: 'Other', pts: 1 }, { k: '', label: 'Unknown', pts: 0 }
  ],
  // Money movement complexity. Stored in the `ownership` field. 5 points.
  own: [
    { k: 'multi', label: 'Many parties per transaction (payer, payee, platform)', pts: 5 },
    { k: 'fx', label: 'Multi-currency or cross-border', pts: 5 },
    { k: 'volume', label: 'High volume, simple flows', pts: 3 },
    { k: 'single', label: 'Single-party, low volume', pts: 0 }, { k: '', label: 'Unknown', pts: 0 }
  ],
  // Ledger stack: how the company tracks balances today. 15 points.
  stack: [
    { k: 'homegrown_strain', label: 'Homegrown ledger showing strain', pts: 15 },
    { k: 'app_db', label: 'Balances in the app database or spreadsheets', pts: 13 },
    { k: 'greenfield', label: 'Launching money movement, no ledger yet', pts: 12 },
    { k: 'psp_only', label: 'Relying on Stripe or bank-partner balances only', pts: 9 },
    { k: 'homegrown_ok', label: 'Mature in-house ledger team', pts: 4 },
    { k: 'vendor', label: 'On another ledger vendor', pts: 3 },
    { k: 'unknown', label: 'Not found', pts: 0 }
  ],
  signals: {
    ledger_job: { label: 'Ledger, payments or billing engineering hire', w: 25, hl: 60, format: 1 },
    money_launch: { label: 'New money product (wallet, payouts, card, credits)', w: 22, hl: 90, format: 3 },
    new_leader: { label: 'New CTO, VP Engineering, payments or finance leader', w: 20, hl: 90, format: 2 },
    funding: { label: 'New funding round', w: 18, hl: 90, format: 2 },
    recon_pain: { label: 'Reconciliation or finance-ops hiring at volume', w: 15, hl: 60, format: 4 },
    eng_writeup: { label: 'Public write-up on balances, double-entry or ledger issues', w: 15, hl: 180, format: 4 },
    expansion: { label: 'New market, currency or rail', w: 12, hl: 120, format: 3 },
    agentic_money: { label: 'Building agents that move money or bill usage', w: 10, hl: 90, format: 2 }
  },
  stages: ['New', 'Researching', 'Contacted', 'Replied', 'Meeting set', 'Open deal', 'Customer', 'Not now', 'Opted out'],
  blockedStages: ['Open deal', 'Customer', 'Opted out']
};

// Ledger vendors, infrastructure partners, consultancies and staffing firms are excluded.
export const EXCLUDE_RE = /\bfragment\b|modern treasury|formance|tigerbeetle|\btwisp\b|\bblnk\b|\bledgible\b|\bstripe\b|accenture|deloitte|kpmg|\bpwc\b|pricewaterhouse|ernst & young|\bey\b|thoughtworks|toptal|staffing|consult|recruit|robert half|insight global|teksystems|randstad|kforce/i;
// Logos on Fragment's public customers page. Kept out of outreach as existing customers.
export const CUSTOMERS = ['Ramp', 'Whop', 'Bill.com', 'Pleo', 'AtoB', 'Nala', 'Basic Capital', 'Odyssey', 'Nomos'];
export const CUSTOMER_RE = new RegExp('^(' + CUSTOMERS.map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(\\b|$)', 'i');

export const FORMATS = {
  1: { name: 'Ledger or payments engineering hire', subject: 'the {{role_short}} role', body: "Hi {{first_name}},\n\nSaw {{company}} is hiring for {{signal_detail}}. When that role exists, someone is usually about to build or rebuild the ledger behind {{industry_use_case}}.\n\nFragment is a ledger API built for that work, so the team ships the product instead of maintaining balance code. Ramp and Whop run on it.\n\nWould it help to see how teams model {{industry_use_case}} on Fragment before the hire starts?\n\n{{sender_first_name}}" },
  2: { name: 'New leader or new round', subject: 'money movement at {{company}}', body: "Hi {{first_name}},\n\nCongrats on {{signal_detail}}. That's usually when the roadmap fills up with new ways to charge, pay out and hold balances.\n\nFragment gives engineering a ledger API for those flows, with Payments and Recon on the same records. It's backed by Stripe and FirstMark.\n\nWorth a short look at what the next money product would take on Fragment?\n\n{{sender_first_name}}" },
  3: { name: 'New money product launch', subject: '{{launch}} at {{company}}', body: "Hi {{first_name}},\n\nSaw the launch of {{launch}}. Products like that tend to multiply the balances a team has to keep correct: {{industry_use_case}}.\n\nFragment is a ledger API made for this, and its MCP server lets agents write the financial code without breaking it. Teams start free on 1,000 entries a month.\n\nWould a model of {{launch}} in Fragment be useful?\n\n{{sender_first_name}}" },
  4: { name: 'Reconciliation or ledger strain', subject: 'reconciliation at {{company}}', body: "Hi {{first_name}},\n\nNoticed {{signal_detail}}. That usually means balances in the product and in the bank drift apart, and people close the gap by hand.\n\nFragment keeps the ledger, payments and reconciliation on one set of records, so the gap closes in the system rather than in a spreadsheet. Pleo and Bill.com use it.\n\nIs reconciliation taking more of the team's time this year?\n\n{{sender_first_name}}" }
};

export const PERSONAS = {
  champion: { label: 'Champion, payments engineering', value: 'A ledger API that handles balances, idempotency and consistency, so the team stops maintaining money code.', titles: ['Head of Payments', 'Engineering Manager Payments', 'Staff Engineer Payments', 'Payments Engineering Lead', 'Head of Platform Engineering'], search: 'Head of Payments, payments or ledger engineering lead, platform engineering manager', kw: 'payments engineering ledger' },
  econ_it: { label: 'Economic buyer, engineering', value: 'Ships new money products in weeks on infrastructure Ramp and Whop already run on, instead of staffing a ledger team.', titles: ['Chief Technology Officer', 'CTO', 'VP Engineering', 'Head of Engineering', 'Co-Founder'], search: 'CTO, VP Engineering, technical co-founder', kw: 'CTO VP Engineering' },
  econ_fin: { label: 'Economic buyer, finance', value: 'Balances, payments and reconciliation on one set of records, so close stops depending on spreadsheets.', titles: ['Chief Financial Officer', 'CFO', 'VP Finance', 'Head of Finance'], search: 'CFO, VP Finance, Head of Finance', kw: 'CFO VP Finance' },
  product: { label: 'Product owner', value: 'New ways to charge, pay and hold value without waiting on a ledger rebuild.', titles: ['Head of Product', 'Product Manager Payments', 'VP Product'], search: 'Head of Product, payments product manager', kw: 'product manager payments' },
  controller: { label: 'Controller or finance ops', value: 'Reconciliation runs in the system, with every entry traceable for audit.', titles: ['Controller', 'Head of Financial Operations', 'Finance Operations Manager'], search: 'Controller, Head of FinOps, finance operations', kw: 'financial operations reconciliation' },
  gatekeeper: { label: 'Technical gatekeeper', value: 'SOC 2 and HIPAA certified, API-first, with an MCP server for agent-written code.', titles: ['Security Engineer', 'Principal Architect', 'Head of Compliance'], search: 'Security, architecture or compliance lead', kw: 'security architect compliance' },
  user: { label: 'Engineer or operator', value: 'Fewer balance bugs and less manual reconciliation.', titles: ['Software Engineer', 'Payments Operations'], search: 'Payments engineer or operator', kw: 'payments engineer' }
};
export const DEFAULT_SLOTS = ['champion', 'econ_it', 'econ_fin'];

// Only facts from Fragment's public site. Drafts may use at most one.
export const PROOF = ['Ramp, Whop, Bill.com, Pleo and AtoB build on Fragment', 'Backed by Stripe, FirstMark and BoxGroup', 'Ledgers, Payments and Recon on one set of records', 'MCP server so agents can write financial code safely', 'SOC 2 and HIPAA certified', 'Free plan with 1,000 ledger entries a month'];

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
    parts: [['Segment', ind.label, ind.pts, 15], ['Ledger stack', stack.label, stack.pts, 15], ['Funding stage', rev.label + (rev.unconfirmed ? ' (unconfirmed)' : ''), rev.pts, 10], ['HQ', geo.label, geo.pts, 5], ['Money movement', own.label, own.pts, 5]]
  };
}

export function pickFormat(a, sc) {
  if (sc.signals[0]) return sc.signals[0].format;
  const k = a.stackOverride || a.research?.stack?.landscape;
  return (k === 'homegrown_strain' || k === 'app_db') ? 4 : 2;
}
