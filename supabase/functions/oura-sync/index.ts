import { db, env, json, serve, user } from '../_shared/core.ts';
import { syncOura } from '../_shared/oura.ts';
serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (req.headers.get('x-cron-secret') === env('CRON_SECRET')) {
    const { data, error } = await db()
      .from('connections')
      .select('user_id')
      .eq('source', 'oura')
      .in('status', ['connected', 'error']);
    if (error) throw error;
    const results = [];
    for (const c of data || []) {
      try {
        results.push({ userId: c.user_id, count: await syncOura(c.user_id) });
      } catch {
        results.push({ userId: c.user_id, error: 'sync_failed' });
      }
    }
    return json({ results });
  }
  const id = await user(req);
  return json({ accepted: await syncOura(id) });
});
