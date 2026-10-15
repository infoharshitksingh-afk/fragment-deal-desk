// Checks each configured key with a free, read-only call, and reports the storage backend.
// Nothing here spends search or email credits.
import { handle, send, ownerOnly } from './_lib/auth.js';
import { getKeys, getSettings, keysReadable } from './_lib/keys.js';
import { backend, persistent } from './_lib/store.js';

async function check(url, opts) {
  try {
    const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(15000) });
    const t = await r.text(); let j = {}; try { j = JSON.parse(t); } catch {}
    return { status: r.status, ok: r.ok, j, text: t.slice(0, 200) };
  } catch (e) { return { status: 0, ok: false, j: {}, text: e.message }; }
}
const msgOf = r => (typeof r.j?.error === 'string' ? r.j.error : r.j?.error?.message) || r.j?.message || r.text || `HTTP ${r.status}`;

export default handle(async (req, res) => {
  ownerOnly(req);
  const [keys, settings, readable] = await Promise.all([getKeys(), getSettings(), keysReadable()]);
  const out = {};
  const tests = {
    anthropic: async k => { const r = await check('https://api.anthropic.com/v1/models', { headers: { 'x-api-key': k, 'anthropic-version': '2023-06-01' } }); return r.ok ? 'Key works.' : Promise.reject(msgOf(r)); },
    firecrawl: async k => {
      const r = await check('https://api.firecrawl.dev/v2/team/credit-usage', { headers: { Authorization: `Bearer ${k}` } });
      if (!r.ok) throw msgOf(r);
      const left = r.j?.data?.remainingCredits ?? r.j?.data?.remaining_credits;
      return left != null ? `Key works. ${left} credits left.` : 'Key works.';
    },
    theirstack: async k => {
      const r = await check('https://api.theirstack.com/v0/catalog/keywords?keyword_type=technology&name_pattern=stripe&limit=8', { headers: { Authorization: `Bearer ${k}` } });
      if (!r.ok) throw msgOf(r);
      const rows = Array.isArray(r.j) ? r.j : (r.j?.data || []);
      const slugs = rows.map(x => x.slug || x.keyword_slug).filter(Boolean).slice(0, 6);
      return 'Key works.' + (slugs.length ? ' Payments technology slugs you can filter on: ' + slugs.join(', ') : '');
    },
    apollo: async k => { const r = await check('https://api.apollo.io/api/v1/auth/health', { headers: { 'x-api-key': k } }); if (!r.ok || r.j?.is_logged_in === false) throw msgOf(r); return 'Key works. People Search still depends on your plan.'; },
    hunter: async k => { const r = await check('https://api.hunter.io/v2/account?api_key=' + encodeURIComponent(k), {}); if (!r.ok) throw msgOf(r); const s = r.j?.data?.requests?.searches; return s ? `Key works. ${s.available - s.used} searches left.` : 'Key works.'; },
    resend: async k => {
      const r = await check('https://api.resend.com/domains', { headers: { Authorization: `Bearer ${k}` } });
      if (r.ok) return 'Key works.';
      if (/restricted/i.test(msgOf(r))) return 'Key works (sending-only key).';
      throw msgOf(r);
    },
    smtpPass: async k => {
      const e = settings.email, s = settings.sender;
      const nodemailer = (await import('nodemailer')).default;
      const t = nodemailer.createTransport({ host: e.smtpHost, port: Number(e.smtpPort) || 465, secure: Number(e.smtpPort) === 465, auth: { user: e.smtpUser || s.fromEmail, pass: k } });
      try { await t.verify(); return 'Signed in to the mail server.'; } catch (err) { throw err.message; }
    }
  };
  await Promise.all(Object.entries(tests).map(async ([id, fn]) => {
    if (!keys[id]) { out[id] = { ok: null, message: 'Not set.' }; return; }
    try { out[id] = { ok: true, message: await fn(keys[id]) }; } catch (e) { out[id] = { ok: false, message: String(e) }; }
  }));
  send(res, 200, { results: out, storage: { backend: backend(), persistent: persistent() }, keysReadable: readable });
});
