// Fake responses for every outside API, so the full pipeline can be exercised without keys or network.
const real = globalThis.fetch;
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });
globalThis.__sent = [];
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url), body = opts.body ? JSON.parse(opts.body) : {};
  if (u.includes('api.theirstack.com/v1/jobs/search')) {
    (globalThis.__tsBodies ||= []).push(body);
    return json({ metadata: {}, data: [
      { job_title: 'Senior Ledger Engineer', company: 'Tidepool Payments', company_domain: 'tidepool.example', short_location: 'New York, NY', final_url: 'https://boards.greenhouse.io/tidepool/jobs/9', date_posted: new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10), technology_slugs: ['stripe'], company_object: { employee_count: 140 } },
      { job_title: 'Billing Engineer', company: 'Kestrel Marketplace', company_domain: 'kestrel.example', short_location: 'Remote', url: 'https://x/2', date_posted: new Date().toISOString().slice(0, 10) },
      { job_title: 'Ledger Engineer', company: 'Ramp', company_domain: 'ramp.com', url: 'https://x/4' },
      { job_title: 'Payments Consultant', company: 'Deloitte', company_domain: 'deloitte.com', url: 'https://x/3' } ] });
  }
  if (u.includes('api.firecrawl.dev/v2/search')) {
    globalThis.__fcCalls = (globalThis.__fcCalls || 0) + 1;
    if (globalThis.__fcCalls === 2) { globalThis.__fc429 = (globalThis.__fc429 || 0) + 1; return json({ success: false, error: 'Rate limit exceeded. Consumed (req/min): 17, Remaining (req/min): 0. please retry after 1s' }, 429); }
    const q = body.query || '';
    if (q.startsWith('site:boards.greenhouse.io')) return json({ success: true, data: { web: [
      { url: 'https://boards.greenhouse.io/kestrel/jobs/1', title: 'Senior Ledger Engineer at Kestrel Marketplace', description: 'Posted 3 days ago. Rebuild our payouts ledger.' },
      { url: 'https://boards.greenhouse.io/accenture/jobs/2', title: 'Payments Integration Lead at Accenture', description: 'Consulting role' } ] } });
    if (q.startsWith('site:')) return json({ success: true, data: { web: [{ url: 'https://jobs.lever.co/northpeak/3', title: 'Payments Platform Engineer - Northpeak Wallet', description: 'Multi-currency wallets, 5 days ago' }] } });
    if (q.includes('official website')) return json({ success: true, data: { web: [{ url: 'https://www.' + q.split(' ')[0].toLowerCase() + '.com/', title: 'Home' }] } });
    if (q.includes('careers')) return json({ success: true, data: { web: [{ url: 'https://www.' + q.split(' ')[0].toLowerCase() + '.com/careers', title: 'Careers - open jobs' }] } });
    if (q.includes('competitors')) return json({ success: true, data: { web: [{ url: 'https://example.com/x', title: 'Top competitors', description: 'Larkspur and Fenwick compete' }] } });
    return json({ success: true, data: { web: [{ url: 'https://news.example.com/a', title: 'Company names new CTO', description: 'Named new CTO in September' }], news: [{ url: 'https://news.example.com/b', title: 'New CTO appointed', snippet: 'appointed a new CTO', date: '2026-09-20' }] } });
  }
  if (u.includes('api.firecrawl.dev/v2/scrape')) return json({ success: true, data: { markdown: 'Open roles: Senior Ledger Engineer. Our ledger service is being rebuilt as payouts grow.' } });
  if (u.includes('api.anthropic.com')) {
    const p = body.messages[0].content;
    let out;
    if (p.startsWith('Extract job postings') && p.includes('Reconciliation Analyst')) out = [{ company: 'Bluewater Payroll', title: 'Reconciliation Analyst', location: 'Dallas', days_ago: 2, vendor: false, relevant: true }, { company: 'Sequoia Capital', title: 'Venture Associate', days_ago: 1, relevant: false }];
    else if (p.startsWith('Extract job postings') && p.includes('Venture Associate')) out = [{ company: 'Sequoia Capital', title: 'Venture Associate', location: 'Menlo Park', days_ago: 1, vendor: false, relevant: false }];
    else if (p.startsWith('Extract job postings')) out = [
      { company: 'Kestrel Marketplace', title: 'Senior Ledger Engineer', location: 'Remote', days_ago: 3, url: 'https://boards.greenhouse.io/kestrel/jobs/1', vendor: false },
      { company: 'Accenture', title: 'Payments Integration Lead', location: '', days_ago: 2, vendor: true },
      { company: 'Northpeak Wallet', title: 'Payments Platform Engineer', location: 'NY', days_ago: 5, vendor: false }];
    else if (p.startsWith('You research')) out = { summary: 'Marketplace paying out to independent sellers.', segment: p.includes('Wallet') ? 'spend' : 'market', revenue: 'ab', hq: 'us', money: 'multi', stack: { landscape: 'homegrown_strain', evidence: 'Our ledger service is being rebuilt as payouts grow.', source: 'S1' }, signals: [{ type: 'new_leader', quote: 'appointed a new CTO', source: 'S1', date: '2026-09-20', why: 'new leader' }], disqualifiers: [], outreach_angle: 'payouts ledger rebuild' };
    else if (p.startsWith('List direct competitors')) out = [{ name: 'Larkspur Payouts', domain: 'larkspur.example', why: 'similar seller payouts' }, { name: 'Accenture', domain: '', why: 'bad' }, { name: 'Whop', domain: 'whop.com', why: 'customer' }];
    else if (p.startsWith('Write a first cold email')) out = { subject: 'the ledger engineer role', body: 'Hi Dana,\n\nSaw Kestrel is hiring a Senior Ledger Engineer.\n\nTom' };
    else out = {};
    return json({ content: [{ type: 'text', text: JSON.stringify(out) }] });
  }
  if (u.includes('mixed_people/api_search')) return json({ people: [
    { id: 'a1', first_name: 'Dana', last_name: 'Ruiz', title: 'Chief Financial Officer', linkedin_url: 'https://www.linkedin.com/in/dana-ruiz' },
    { id: 'a2', first_name: 'Sam', last_name: 'Ito', title: 'Head of Payments Engineering', linkedin_url: 'https://www.linkedin.com/in/sam-ito' },
    { id: 'a3', first_name: 'Lee', last_name: 'Park', title: 'CTO', linkedin_url: '' }] });
  if (u.includes('people/match')) return json({ person: { first_name: 'X', last_name: 'Y', email: (body.id || 'p') + '@kestrel.example', email_status: 'verified' } });
  if (u.includes('api.hunter.io')) return json({ data: { email: 'h@example.com', verification: { status: 'valid' } } });
  if (u.includes('api.resend.com')) { globalThis.__sent.push(body); return json({ id: 'msg_' + globalThis.__sent.length }); }
  return real(url, opts);
};
