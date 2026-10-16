import { handle, send, readBody, UserError } from './_lib/auth.js';
import { STAGES } from './_lib/pipeline.js';
import { stageCrawl } from './_lib/sources.js';

export default handle(async (req, res) => {
  if (req.method !== 'POST') throw new UserError('Use POST.', 405);
  const b = await readBody(req);
  if (b.stage === 'crawl') return send(res, 200, await stageCrawl(Number(b.crawled) || 0));
  const fn = STAGES[b.stage];
  if (!fn) throw new UserError('Unknown stage.');
  send(res, 200, await fn(Number(b.used) || 0));
});
