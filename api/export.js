import XLSX from 'xlsx';
import { requireAccess, send } from './_lib/auth.js';
import { listAccounts, listRegistry } from './_lib/pipeline.js';
import { ICP, PERSONAS, score } from './_lib/icp.js';

const lab = (list, k) => (list.find(o => o.k === (k || '')) || {}).label || '';

export default async function handler(req, res) {
  // Browser downloads can't send headers, so the access code may come as a query parameter here.
  const code = new URL(req.url, 'http://x').searchParams.get('code');
  if (code && !req.headers['x-access-code']) req.headers['x-access-code'] = code;
  if (!(await requireAccess(req, res))) return;
  try {
    const [accounts, registry] = await Promise.all([listAccounts(), listRegistry()]);
    const A = [], C = [], S = [], D = [];
    for (const [id, a] of Object.entries(accounts)) {
      const sc = score(a);
      A.push({ Company: a.name, Domain: a.domain, Tier: sc.tier || 'Not researched', Fit: sc.fit, Timing: Math.round(sc.timing), Segment: lab(ICP.industries, a.industry), 'Funding stage': lab(ICP.revenue, a.revenue), HQ: lab(ICP.geo, a.geo), 'Money movement': lab(ICP.own, a.ownership), 'Ledger stack': lab(ICP.stack, a.stackOverride || a.research?.stack?.landscape || 'unknown'), 'Top signal': sc.signals[0] ? `${sc.signals[0].label}: ${sc.signals[0].quote}` : '', Stage: a.stage, Source: a.source || '', 'Competitor of': a.competitorOf || '', 'Careers page': a.careersUrl || '', Summary: a.research?.summary || '', Researched: a.research?.researchedAt?.slice(0, 10) || '', 'Account ID': id });
      for (const s of sc.signals) S.push({ Company: a.name, Signal: s.label, Quote: s.quote, Date: s.date || '', 'Current weight': s.cur, Source: s.origin === 'feed' ? (s.url || s.feed) : ((a.research?.sources || []).find(z => z.id === s.source)?.url || '') });
      (a.contacts || []).forEach(c => {
        if (c.placeholder) { C.push({ Company: a.name, Tier: sc.tier || '', Name: '(to fill)', Title: PERSONAS[c.role]?.search || '', Role: PERSONAS[c.role]?.label || c.role, Email: '', 'Email status': '', LinkedIn: '', 'Draft status': '' }); return; }
        C.push({ Company: a.name, Tier: sc.tier || '', Name: c.name, Title: c.title, Role: PERSONAS[c.role]?.label || c.role, Email: c.email || '', 'Email status': c.emailStatus || '', LinkedIn: c.linkedin || '', 'Draft status': c.draft?.status || '' });
        if (c.draft) D.push({ Company: a.name, To: c.name, Email: c.email || '', Subject: c.draft.subject, Body: c.draft.body, Status: c.draft.status, 'Sent at': c.draft.sentAt || '' });
      });
    }
    const R = Object.values(registry).map(r => ({ Company: r.name, Domain: r.domain || '', Status: r.status, Reason: r.reason || '', Source: r.source || '', 'Competitor of': r.competitorOf || '', 'First seen': (r.firstSeen || '').slice(0, 10), 'Last seen': (r.lastSeen || '').slice(0, 10) }));
    const wb = XLSX.utils.book_new();
    const sheet = (rows, name) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ Note: 'No rows yet' }]), name);
    sheet(A.sort((x, y) => String(x.Tier).localeCompare(String(y.Tier)) || y.Fit + y.Timing - x.Fit - x.Timing), 'Accounts');
    sheet(C, 'Contacts'); sheet(S, 'Signals'); sheet(D, 'Drafts'); sheet(R, 'Company registry');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="fragment-deal-desk-${new Date().toISOString().slice(0, 10)}.xlsx"`);
    res.setHeader('Cache-Control', 'no-store');
    res.end(buf);
  } catch (e) { console.error(e); send(res, 500, { error: 'export_failed', message: e.message }); }
}
