import crypto from 'node:crypto';
import { handle, send, readBody, ownerOnly, hashCode, safeEqual, UserError } from './_lib/auth.js';
import { saveKeys, saveSettings, keyStatus, getSettings } from './_lib/keys.js';
import { get, set } from './_lib/store.js';

export default handle(async (req, res) => {
  if (req.method === 'POST') {
    const b = await readBody(req);
    if (b.keys) { ownerOnly(req); await saveKeys(b.keys); }
    if ('teamCode' in b) {
      ownerOnly(req);
      if (b.teamCode === null) await set('team', null);
      else {
        const code = String(b.teamCode || '').trim();
        if (code.length < 8) throw new UserError('Use at least 8 characters for the team code.');
        if (safeEqual(code, process.env.ACCESS_CODE)) throw new UserError('The team code must be different from your owner code.');
        const salt = crypto.randomBytes(16).toString('hex');
        await set('team', { salt, hash: hashCode(code, salt), setAt: new Date().toISOString() });
      }
    }
    if (b.settings) {
      const patch = { ...b.settings };
      if (req.role !== 'owner') delete patch.limits; // team can edit rules and sender details, not spending caps
      await saveSettings(patch);
    }
  }
  const team = await get('team');
  send(res, 200, { keys: await keyStatus(req.role), settings: await getSettings(), role: req.role, teamSet: !!team?.hash });
});
