// Scheduled run (see vercel.json). Vercel sends "Authorization: Bearer <CRON_SECRET>" when CRON_SECRET is set.
import { send, safeEqual } from './_lib/auth.js';
import { STAGES } from './_lib/pipeline.js';
import { pushLog } from './_lib/store.js';

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !safeEqual(req.headers.authorization, `Bearer ${secret}`)) return send(res, 401, { error: 'unauthorized', message: 'Set CRON_SECRET to enable scheduled runs.' });
  const started = Date.now(), budget = 270e3, log = [];
  let used = 0;
  const order = ['source', 'research', 'competitors', 'research', 'people', 'emails', 'drafts'];
  try {
    for (const stage of order) {
      for (let i = 0; i < 50 && Date.now() - started < budget; i++) {
        const r = await STAGES[stage](used);
        if (r.used != null) used = r.used;
        log.push(`${stage}: ${r.message}`);
        if (!r.remaining) break;
      }
      if (Date.now() - started >= budget) { log.push('Stopped at the time limit; the next run continues.'); break; }
    }
  } catch (e) { log.push('Error: ' + e.message); }
  await pushLog({ stage: 'cron', message: `Scheduled run: ${log.length} steps` });
  send(res, 200, { ok: true, log });
}
