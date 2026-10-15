import { handle, send, readBody, UserError } from './_lib/auth.js';
import { STAGES } from './_lib/pipeline.js';

export default handle(async (req, res) => {
  if (req.method !== 'POST') throw new UserError('Use POST.', 405);
  const { stage, used } = await readBody(req);
  const fn = STAGES[stage];
  if (!fn) throw new UserError('Unknown stage.');
  send(res, 200, await fn(Number(used) || 0));
});
