// Fake responses for every outside API, so the full pipeline can be exercised without keys or network.
const real = globalThis.fetch;
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });
globalThis.__sent = [];
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url), body = opts.body ? JSON.parse(opts.body) : {};
  if (u.includes('api.firecrawl.dev/v2/search')) {
    globalThis.__fcCalls = (globalThis.__fcCalls || 0) + 1;
    if (globalThis.__fcCalls === 2) { globalThis.__fc429 = (globalThis.__fc429 || 0) + 1; return json({ success: false, error: 'Rate limit exceeded. Consumed (req/min): 17, Remaining (req/min): 0. please retry after 1s' }, 429); }
    const q = body.query || '';
    if (q.includes('official website')) return json({ success: true, data: { web: [{ url: 'https://www.' + q.split(' ')[0].toLowerCase() + '.com/', title: 'Home' }] } });
    if (q.includes('careers')) return json({ success: true, data: { web: [{ url: 'https://www.' + q.split(' ')[0].toLowerCase() + '.com/careers', title: 'Careers - open jobs' }] } });
    if (q.includes('competitors')) return json({ success: true, data: { web: [{ url: 'https://example.com/x', title: 'Top competitors', description: 'Larkspur and Fenwick compete' }] } });
    if (!/^"[^"]+" \(/.test(q)) return json({ success: true, data: { web: [], news: [
      { url: 'https://news.example.com/kestrel', title: 'Kestrel Marketplace launches instant seller payouts', snippet: 'Kestrel Marketplace today launched instant payouts for 40,000 sellers', date: '2026-10-08' },
      { url: 'https://news.example.com/northpeak', title: 'Northpeak Wallet ships AI agents that pay vendors', snippet: 'Northpeak Wallet launched agents that pay vendors on behalf of customers', date: '2026-10-05' },
      { url: 'https://news.example.com/ramp', title: 'Ramp expands agents', snippet: 'Ramp launched new agents', date: '2026-10-01' } ] } });
    return json({ success: true, data: { web: [{ url: 'https://news.example.com/a', title: 'Company names new CTO', description: 'Named new CTO in September' }], news: [{ url: 'https://news.example.com/b', title: 'New CTO appointed', snippet: 'appointed a new CTO', date: '2026-09-20' }] } });
  }
  if (u.includes('api.firecrawl.dev/v2/scrape')) {
    globalThis.__scrapes = (globalThis.__scrapes || 0) + 1;
    if (String(body.url).includes('sources.example/a')) return json({ success: true, data: { markdown: [
      'Orbit Agents launches AI agents that reconcile and pay vendor invoices for mid-market companies',
      'Kestrel Marketplace adds instant payouts in Canada for its marketplace sellers this week',
      ...(globalThis.__srcV >= 2 ? ['Pylon Billing launches usage-based billing for AI products with prepaid credits'] : [])].join('\n') } });
    if (String(body.url).includes('sources.example/broken')) return json({ success: false, error: 'Blocked by the site' }, 403);
    if (String(body.url).includes('sources.example/b')) return json({ success: true, data: { markdown: 'Nothing to see here on this page today. About us, contact and careers links only.' } });
    return json({ success: true, data: { markdown: 'We pay out to sellers instantly. Our ledger service is being rebuilt as payouts grow.' } });
  }
  if (u.includes('api.anthropic.com')) {
    const p = body.messages[0].content;
    let out;
    if (p.startsWith('You find prospects') && p.includes('Orbit Agents')) out = [
      { company: 'Orbit Agents', domain: 'orbit.example', type: 'agent_launch', quote: 'launches AI agents that reconcile and pay vendor invoices', date: '2026-10-12', relevant: true, vendor: false },
      { company: 'Kestrel Marketplace', type: 'expansion', quote: 'adds instant payouts in Canada', date: '2026-10-12', relevant: true, vendor: false }];
    else if (p.startsWith('You find prospects') && p.includes('Pylon Billing')) out = [{ company: 'Pylon Billing', type: 'money_launch', quote: 'launches usage-based billing for AI products', date: '2026-10-14', relevant: true, vendor: false }];
    else if (p.startsWith('You find prospects') && p.includes('Nothing to see here')) out = [];
    else if (p.startsWith('You find prospects') && p.includes('Bluewater Payroll launches')) out = [{ company: 'Bluewater Payroll', type: 'money_launch', quote: 'Bluewater Payroll launches earned wage access wallets', date: '2026-10-10', relevant: true, vendor: false }, { company: 'Sequoia Capital', type: 'funding', quote: 'Sequoia closes new fund', relevant: false }];
    else if (p.startsWith('You find prospects') && p.includes('closes new fund')) out = [{ company: 'Sequoia Capital', type: 'funding', quote: 'Sequoia closes new fund', date: '2026-10-01', relevant: false, vendor: true }];
    else if (p.startsWith('You find prospects')) out = [
      { company: 'Kestrel Marketplace', domain: 'kestrel.example', type: 'money_launch', quote: 'launched instant payouts for 40,000 sellers', date: '2026-10-08', url: 'https://news.example.com/kestrel', relevant: true, vendor: false },
      { company: 'Northpeak Wallet', type: 'agent_launch', quote: 'launched agents that pay vendors on behalf of customers', date: '2026-10-05', url: 'https://news.example.com/northpeak', relevant: true, vendor: false },
      { company: 'Accenture', type: 'funding', quote: 'consulting', relevant: true, vendor: true },
      { company: 'Ramp', domain: 'ramp.com', type: 'agent_launch', quote: 'launched new agents', relevant: true, vendor: false }];
    else if (p.startsWith('You research')) out = { summary: 'Marketplace paying out to independent sellers.', segment: p.includes('Wallet') ? 'spend' : 'market', revenue: 'ab', hq: 'us', money: 'multi', stack: { landscape: 'homegrown_strain', evidence: 'Our ledger service is being rebuilt as payouts grow.', source: 'S1' }, signals: [{ type: 'new_leader', quote: 'appointed a new CTO', source: 'S1', date: '2026-09-20', why: 'new leader' }], disqualifiers: [], outreach_angle: 'payouts ledger rebuild' };
    else if (p.startsWith('List direct competitors')) out = [{ name: 'Larkspur Payouts', domain: 'larkspur.example', why: 'similar seller payouts' }, { name: 'Accenture', domain: '', why: 'bad' }, { name: 'Whop', domain: 'whop.com', why: 'customer' }];
    else if (p.startsWith('Write a first cold email')) out = { subject: 'the ledger engineer role', body: 'Hi Dana,\n\nSaw Kestrel is hiring a Senior Ledger Engineer.\n\nTom' };
    else out = {};
    return json({ content: [{ type: 'text', text: JSON.stringify(out) }] });
  }
  if (u.includes('mixed_people/api_search')) return json({ people: [
    { id: 'a1', first_name: 'Dana', last_name: 'Ruiz', title: 'Head of Product', linkedin_url: 'https://www.linkedin.com/in/dana-ruiz' },
    { id: 'a2', first_name: 'Sam', last_name: 'Ito', title: 'Head of Payments Engineering', linkedin_url: 'https://www.linkedin.com/in/sam-ito' },
    { id: 'a3', first_name: 'Lee', last_name: 'Park', title: 'CTO', linkedin_url: '' }] });
  if (u.includes('people/match')) return json({ person: { first_name: 'X', last_name: 'Y', email: (body.id || 'p') + '@kestrel.example', email_status: 'verified' } });
  if (u.includes('api.hunter.io')) return json({ data: { email: 'h@example.com', verification: { status: 'valid' } } });
  if (u.includes('api.resend.com')) { globalThis.__sent.push(body); return json({ id: 'msg_' + globalThis.__sent.length }); }
  return real(url, opts);
};
