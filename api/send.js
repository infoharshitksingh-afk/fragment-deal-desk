import { handle, send, readBody, UserError } from './_lib/auth.js';
import { sendApproved } from './_lib/pipeline.js';

export default handle(async (req, res) => {
  if (req.method !== 'POST') throw new UserError('Use POST.', 405);
  const b = await readBody(req);
  send(res, 200, await sendApproved(b.id ? { id: b.id, idx: b.idx } : {}));
});
