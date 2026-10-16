// Source registry actions: add, edit, pause, remove, crawl one now, add a suggested domain.
import { handle, send, readBody, UserError } from './_lib/auth.js';
import { addSource, updateSource, removeSource, crawlSource, listSources, suggestions } from './_lib/sources.js';

export default handle(async (req, res) => {
  if (req.method !== 'POST') throw new UserError('Use POST.', 405);
  const b = await readBody(req);
  let result = null;
  switch (b.action) {
    case 'add': result = await addSource(b.source || {}); break;
    case 'update': result = await updateSource(b.id, b.patch || {}); break;
    case 'remove': await removeSource(b.id); break;
    case 'crawl': result = await crawlSource(b.id, { force: !!b.force }); break;
    case 'addSuggested': {
      const d = String(b.domain || '').replace(/[^a-z0-9.\-]/gi, '');
      if (!d) throw new UserError('No domain given.');
      result = await addSource({ name: d, url: 'https://' + d + '/', type: 'News', cadenceDays: 7, prior: 0.45, notes: 'Suggested by open-search results. Point the URL at the page that lists stories or companies.' });
      break;
    }
    default: throw new UserError('Unknown action.');
  }
  send(res, 200, { ok: true, result, sources: await listSources(), suggestions: await suggestions() });
});
