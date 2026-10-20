import { body, db, json, rpc, serve, user } from '../_shared/core.ts';
import { validateRecords } from '../_shared/records.ts';
serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const id = await user(req, true);
  const b = await body(req);
  if (b.version !== 1 || typeof b.batchId !== 'string' || !b.batchId || b.batchId.length > 200)
    throw new Error('Invalid batch');
  validateRecords(b.records);
  // Devices cannot impersonate cloud providers.
  if (
    req.headers.get('Authorization')?.startsWith('Bearer ht_') &&
    b.records.some((r: { source: string }) => !['health_task', 'health_connect'].includes(r.source))
  )
    throw new Error('Forbidden');
  try {
    const count = await rpc('health_ingest', {
      p_user: id,
      p_batch: b.batchId,
      p_records: b.records,
    });
    return json({ accepted: count, batchId: b.batchId });
  } catch (e) {
    const { error } = await db()
      .from('sync_runs')
      .upsert(
        {
          user_id: id,
          source: 'batch',
          batch_id: b.batchId,
          status: 'failed',
          error: 'ingest_failed',
          finished_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,source,batch_id', ignoreDuplicates: true },
      );
    if (error) console.error('Unable to persist ingest failure');
    throw e;
  }
});
