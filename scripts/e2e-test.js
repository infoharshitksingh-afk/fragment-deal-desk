// End-to-end test with mocked outside APIs: settings, sourcing, dedupe, research, competitors, people, emails, drafts, send, export.
process.env.ACCESS_CODE = 'test-code'; process.env.DD_STORE_FILE = '/tmp/dd-e2e.json'; process.env.FIRECRAWL_GAP_MS = '0'; process.env.DD_SKIP_SEED = '1';
import fs from 'node:fs';
try { fs.unlinkSync('/tmp/dd-e2e.json'); } catch {}
await import('./mocks.js');
const { createServer } = await import('./dev-server.js');
const srv = createServer().listen(0); const port = srv.address().port;
const api = async (p, body, code = 'test-code') => { const r = await fetch(`http://localhost:${port}/api/${p}`, { method: body ? 'POST' : 'GET', headers: { 'x-access-code': code, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: r.headers.get('content-type')?.includes('json') ? await r.json() : await r.arrayBuffer() }; };
const ok = (c, m) => { if (!c) { console.error('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };

ok((await api('state', null, 'wrong')).status === 401, 'wrong access code is refused');
let r = await api('settings', { keys: { anthropic: 'sk-test-AAAA', firecrawl: 'fc-test-BBBB', apollo: 'ap-CCCC', resend: 're_DDDD' }, settings: { autoFindEmails: true, sender: { name: 'Tom', title: 'Co-founder', fromEmail: 'tom@fragment.example', footer: 'Fragment, 416 W. 13th Street, New York. Not relevant? Reply "no" and I won\'t follow up.' }, email: { provider: 'resend' } } });
ok(r.body.keys.anthropic.set && r.body.keys.anthropic.last4 === 'AAAA' && !JSON.stringify(r.body).includes('sk-test'), 'keys saved encrypted; only last 4 returned');
ok(!fs.readFileSync('/tmp/dd-e2e.json', 'utf8').includes('sk-test'), 'raw keys not stored in plain text');

const log = [];
let used = 0;
for (const stage of ['source', 'research', 'competitors', 'research', 'people', 'emails', 'drafts']) {
  for (let i = 0; i < 20; i++) { const x = await api('run', { stage, used }); if (x.status !== 200) { log.push(stage + ' ERROR ' + x.body.message); break; } if (x.body.used != null) used = x.body.used; log.push(stage + ': ' + x.body.message); if (!x.body.remaining) break; }
}
console.log(log.join('\n'));
let st = (await api('state')).body;
const names = st.accounts.map(a => a.name).sort();
ok(names.includes('Kestrel Marketplace') && names.includes('Northpeak Wallet'), 'sourced companies added as accounts');
ok(/Ran 7 searches/.test(log[0]), 'every default sourcing search ran (no job or hiring sources)');
ok(!names.includes('Accenture'), 'vendor excluded');
let st2 = (await api('state')).body;
ok(!st2.accounts.some(a => a.name === 'Ramp') && st2.registry.some(x => x.name === 'Ramp' && /customer/i.test(x.reason || '')), 'existing Fragment customers are excluded, with the reason recorded');
const kes = st2.accounts.find(a => a.name === 'Kestrel Marketplace');
ok(kes && kes.domain === 'kestrel.example' && kes.importedSignals.some(x => x.type === 'money_launch'), 'news sourcing adds companies with domain and the launch signal');
ok(globalThis.__fc429 === 1 && !log.some(l => l.includes('ERROR')), 'Firecrawl rate limit is waited out and retried');
ok(st.registry.some(x => x.name === 'Accenture' && x.status === 'excluded'), 'excluded company recorded in the registry');
ok(names.includes('Larkspur Payouts') && !names.includes('Whop'), 'peer added; customer peer skipped');
const acme = st.accounts.find(a => a.name === 'Kestrel Marketplace');
ok(acme.research && acme.score.tier === '1', 'research done and tier 1 (' + acme.score.tier + ', fit ' + acme.score.fit + ')');
ok(acme.research.stack.landscape === 'homegrown_strain' && acme.ownership === 'multi', 'technology fit and money movement read from research');
ok(['champion', 'econ_it', 'product'].every(r => acme.contacts.some(c => !c.placeholder && c.role === r)), 'payments lead, CTO and product lead mapped to roles');
ok(acme.contacts.filter(c => !c.placeholder).length === 3, 'three people found via Apollo');
ok(acme.contacts.every(c => c.placeholder || c.email), 'emails found');
ok(acme.contacts.some(c => c.draft), 'drafts written');

// second run: no duplicates
st = (await api('state')).body;
const before = st.accounts.length;
await api('run', { stage: 'source' });
st = (await api('state')).body;
ok(st.accounts.length === before, 'second sourcing run adds no duplicates');

// approve + send
const idx = acme.contacts.findIndex(c => c.draft);
r = await api('accounts', { action: 'updateContact', id: acme.id, idx, patch: { draft: { status: 'Approved' } } });
ok(r.body.account.contacts[idx].draft.status === 'Approved', 'draft approved');
r = await api('send', {});
ok(r.body.sent === 1 && globalThis.__sent.length === 1 && globalThis.__sent[0].text.includes('Reply "no"'), 'approved email sent with footer');
r = await api('send', {});
ok(r.body.sent === 0, 'sent email is never resent');

// feed import + manual add + export
r = await api('accounts', { action: 'importFeed', text: 'Fintech newsletter text mentioning several companies and their launches this week' });
ok(r.status === 200 && r.body.known >= 1, 'pasted list dedupes against known companies');
r = await api('accounts', { action: 'importFeed', source: 'Newsletter', text: 'This week in venture: Sequoia closes new fund for early-stage companies' });
ok(r.status === 200 && r.body.relevant === 0 && /none fit/.test(r.body.message), 'list with only off-ICP companies explains why nothing was added');
r = await api('accounts', { action: 'importFeed', source: 'Money2020 exhibitors', text: 'Bluewater Payroll launches earned wage access wallets. Sequoia closes new fund.' });
st = (await api('state')).body;
ok(r.status === 200 && r.body.relevant === 1 && st.accounts.some(a => a.name === 'Bluewater Payroll' && a.source === 'Money2020 exhibitors' && a.signals.some(x => x.type === 'money_launch')) && !st.accounts.some(a => a.name === 'Sequoia Capital'), 'pasted list imports ICP companies labelled by source and skips the rest');
r = await api('accounts', { action: 'add', name: 'Gulfline Remit', domain: 'gulfline.example' });
ok(r.body.status === 'added', 'manual add works');
const ex = await fetch(`http://localhost:${port}/api/export?code=test-code`);
const buf = Buffer.from(await ex.arrayBuffer());
ok(ex.status === 200 && buf.slice(0, 2).toString() === 'PK', 'Excel export downloads (' + buf.length + ' bytes)');
const XLSX = (await import('xlsx')).default; const wb = XLSX.read(buf);
ok(['Accounts', 'Contacts', 'Signals', 'Drafts', 'Company registry'].every(n => wb.SheetNames.includes(n)), 'workbook has all five sheets');

// ---- team access, limits, starting data ----
r = await api('settings', { teamCode: 'team-pass-123' });
ok(r.status === 200 && r.body.teamSet, 'owner sets a team code');
r = await api('settings', { teamCode: 'test-code' });
ok(r.status === 400, 'team code must differ from the owner code');
const T = (p, body) => api(p, body, 'team-pass-123');
st = (await api('state')).body;
let ts1 = await T('state');
ok(ts1.status === 200 && ts1.body.role === 'team' && ts1.body.accounts.length === st.accounts.length, 'team signs in and sees the same accounts');
ok(Object.values(ts1.body.keys).every(k => !k.last4) && ts1.body.keys.anthropic.set, 'team sees which keys are connected but no key characters');
ok((await T('settings', { keys: { anthropic: 'sk-evil' } })).status === 403, 'team cannot change API keys');
ok((await T('settings', { teamCode: 'another-code-1' })).status === 403, 'team cannot change the team code');
ok((await T('test-keys', {})).status === 403, 'team cannot run key tests');
await T('settings', { settings: { limits: { anthropic: 99999 }, sender: { title: 'Co-founder' } } });
let st3 = (await api('state')).body;
ok(st3.settings.limits.anthropic === 400 && st3.settings.sender.title === 'Co-founder', 'team can edit rules and sender but not limits');
const acctId = st3.accounts[0].id;
ok((await T('accounts', { action: 'update', id: acctId, patch: { notes: 'edited by team' } })).status === 200 && (await api('state')).body.accounts.find(a => a.id === acctId).notes === 'edited by team', 'team edits are visible to the owner');
await api('settings', { settings: { limits: { anthropic: 0 } } });
r = await T('accounts', { action: 'importFeed', text: 'Bluewater Payroll launches earned wage access wallets, more text here' });
ok(r.status === 429 && r.body.error === 'budget', 'daily limit stops paid calls with a clear message');
await api('settings', { settings: { limits: { anthropic: 400 } } });
ok(Number((await api('state')).body.usage.anthropic) > 0, 'usage is counted per day');
ok((await api('state', null, 'wrong-team-code')).status === 401, 'wrong team code is refused');
await api('settings', { teamCode: null });
ok((await T('state')).status === 401, 'turning off team access revokes the team code');
delete process.env.DD_SKIP_SEED;
let s1 = (await api('state')).body, s2 = (await api('state')).body;
ok(s1.accounts.length === st3.accounts.length && s2.accounts.length === s1.accounts.length, 'empty starting data adds nothing and loads once');
ok(s1.model.CUSTOMERS.includes('Ramp') && s1.model.ICP.stack.length === 9 && !('ledger_job' in s1.model.ICP.signals) && s1.model.ICP.industries[0].k === 'agentic', 'UI receives the new ICP: agentic segment first, no hiring signal');
srv.close();
