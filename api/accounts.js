import { handle, send, readBody, UserError } from './_lib/auth.js';
import { getAccount, saveAccount, patchAccount, deleteAccount, upsertCompany, researchAccount, findEmailFor, draftFor, importFeedText, withScore, importRowsData } from './_lib/pipeline.js';
import { getSettings } from './_lib/keys.js';
import { roleFor, ICP } from './_lib/icp.js';

const EDITABLE = ['name', 'domain', 'industry', 'revenue', 'geo', 'ownership', 'stackOverride', 'stage', 'careersUrl', 'newsUrl', 'owner', 'notes'];
const emailOk = e => !e || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

export default handle(async (req, res) => {
  if (req.method !== 'POST') throw new UserError('Use POST.', 405);
  const b = await readBody(req);
  const { action, id } = b;
  const reply = async (extra = {}) => { const a = id ? await getAccount(id) : null; send(res, 200, { ok: true, account: a ? { id, ...withScore(a) } : null, ...extra }); };

  switch (action) {
    case 'add': {
      if (!String(b.name || '').trim()) throw new UserError('Enter the company name.');
      const r = await upsertCompany({ name: b.name, domain: b.domain || '', source: 'Added by hand', fields: Object.fromEntries(EDITABLE.filter(k => b[k]).map(k => [k, b[k]])) }, await getSettings());
      return send(res, 200, { ok: true, ...r });
    }
    case 'importRows': return send(res, 200, { ok: true, ...(await importRowsData(b.rows, await getSettings())) });
    case 'importFeed': {
      const label = String(b.source || '').replace(/[^\w .\-]/g, '').trim().slice(0, 40) || 'Pasted feed';
      return send(res, 200, { ok: true, ...(await importFeedText(String(b.text || '').slice(0, 60000), label)) });
    }
    case 'update': {
      const patch = Object.fromEntries(EDITABLE.filter(k => k in (b.patch || {})).map(k => [k, b.patch[k]]));
      if (patch.stage && !ICP.stages.includes(patch.stage)) throw new UserError('Unknown stage.');
      await patchAccount(id, patch); return reply();
    }
    case 'delete': await deleteAccount(id); return send(res, 200, { ok: true });
    case 'research': await researchAccount(id); return reply();
    case 'addContact': case 'saveContact': {
      const a = await getAccount(id); if (!a) throw new UserError('Account not found.', 404);
      const c = b.contact || {};
      if (!String(c.name || '').trim()) throw new UserError('Enter a name.');
      if (!emailOk(c.email)) throw new UserError("That email doesn't look right.");
      const contacts = [...(a.contacts || [])];
      const entry = { name: c.name.trim(), title: (c.title || '').trim(), email: (c.email || '').trim(), emailStatus: c.email ? 'added by you' : '', linkedin: (c.linkedin || '').trim(), role: c.role || roleFor(c.title), placeholder: false, source: 'Added by hand', addedAt: new Date().toISOString() };
      if (action === 'saveContact' && Number.isInteger(b.idx) && contacts[b.idx]) contacts[b.idx] = { ...contacts[b.idx], ...entry, role: contacts[b.idx].role || entry.role };
      else contacts.push(entry);
      await saveAccount(id, { ...a, contacts }); return reply();
    }
    case 'updateContact': {
      const a = await getAccount(id); const c = a?.contacts?.[b.idx]; if (!c) throw new UserError('Contact not found.', 404);
      const p = b.patch || {}; const next = { ...c };
      if (p.role) next.role = p.role;
      if (p.draft) next.draft = { ...(c.draft || {}), ...p.draft, status: ['Draft', 'Approved'].includes(p.draft.status) ? p.draft.status : (c.draft?.status || 'Draft'), editedAt: new Date().toISOString() };
      if (c.draft?.status === 'Sent' && p.draft) throw new UserError('That email was already sent.');
      a.contacts[b.idx] = next; await saveAccount(id, a); return reply();
    }
    case 'removeContact': { const a = await getAccount(id); a.contacts.splice(b.idx, 1); await saveAccount(id, a); return reply(); }
    case 'findEmail': { const r = await findEmailFor(id, b.idx); return reply({ result: r }); }
    case 'draft': await draftFor(id, b.idx, b.format); return reply();
    default: throw new UserError('Unknown action.');
  }
});
