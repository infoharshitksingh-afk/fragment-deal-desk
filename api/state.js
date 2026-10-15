import { handle, send } from './_lib/auth.js';
import { listAccounts, listRegistry, withScore, ensureSeed } from './_lib/pipeline.js';
import { keyStatus, getSettings, keysReadable, usageToday } from './_lib/keys.js';
import { getLog, backend, persistent, get } from './_lib/store.js';
import { ICP, FORMATS, PERSONAS, CUSTOMERS } from './_lib/icp.js';

export default handle(async (req, res) => {
  await ensureSeed().catch(e => console.error('seed', e));
  const [accounts, registry, keys, settings, log, readable, usage, team] = await Promise.all([listAccounts(), listRegistry(), keyStatus(req.role), getSettings(), getLog(80), keysReadable(), usageToday(), get('team')]);
  send(res, 200, {
    accounts: Object.entries(accounts).map(([id, a]) => ({ id, ...withScore(a) })),
    registry: Object.entries(registry).map(([key, r]) => ({ key, ...r })),
    keys, settings, log, role: req.role, teamSet: !!team?.hash, usage,
    storage: { backend: backend(), persistent: persistent(), keysReadable: readable },
    model: { ICP, FORMATS, PERSONAS, CUSTOMERS }
  });
});
