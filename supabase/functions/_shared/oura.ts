import { assertAllowedUser, db, decrypt, encrypt, env, rpc } from './core.ts';
import { ouraGet, ouraExchange } from './oura-http.ts';
export async function exchange(params: Record<string, string>) {
  return ouraExchange(params, env('OURA_CLIENT_ID'), env('OURA_CLIENT_SECRET'));
}
export async function saveToken(id: string, t: Record<string, unknown>) {
  await rpc('health_oura_token', {
    p_user: id,
    p_cipher: await encrypt(t),
    p_expiry: new Date(Date.now() + Number(t.expires_in) * 1000).toISOString(),
  });
}
export async function syncOura(id: string) {
  await assertAllowedUser(id);
  const lease = crypto.randomUUID();
  if (!(await rpc('health_oura_lock', { p_user: id, p_lease: lease })))
    throw new Error('Sync already running');
  const runId = crypto.randomUUID();
  try {
    const { error } = await db()
      .from('sync_runs')
      .insert({ id: runId, user_id: id, source: 'oura', batch_id: lease, status: 'running' });
    if (error) throw error;
    const count = await syncOuraLocked(id);
    const { error: finishError } = await db()
      .from('sync_runs')
      .update({ status: 'completed', record_count: count, finished_at: new Date().toISOString() })
      .eq('id', runId);
    if (finishError) throw finishError;
    return count;
  } catch (e) {
    const { error: logError } = await db()
      .from('sync_runs')
      .update({
        status: 'failed',
        error: 'oura_sync_failed',
        finished_at: new Date().toISOString(),
      })
      .eq('id', runId);
    if (logError) console.error('Unable to persist sync failure');
    throw e;
  } finally {
    await rpc('health_oura_lock', { p_user: id, p_lease: lease, p_release: true });
  }
}
async function syncOuraLocked(id: string) {
  const stored = await rpc('health_oura_token', { p_user: id });
  if (!stored) throw new Error('Oura not connected');
  let t = await decrypt(stored.ciphertext);
  if (Date.parse(stored.expiresAt) < Date.now() + 120000) {
    try {
      const next = await exchange({ grant_type: 'refresh_token', refresh_token: t.refresh_token });
      t = { ...next, refresh_token: next.refresh_token || t.refresh_token };
      await saveToken(id, t);
    } catch (e) {
      const permanent = e instanceof Error && e.message === 'Oura authorization failed';
      await db()
        .from('connections')
        .update({
          status: permanent ? 'reauthorize' : 'error',
          error_code: 'token_refresh_failed',
          last_error: permanent
            ? 'Oura 인증이 만료되었습니다. 다시 연결해 주세요.'
            : 'Oura 인증 갱신에 실패했습니다. 다음 예약 시간에 재시도합니다.',
        })
        .eq('user_id', id)
        .eq('source', 'oura');
      throw e;
    }
  }
  const { data: connection } = await db()
    .from('connections')
    .select('last_synced_at')
    .eq('user_id', id)
    .eq('source', 'oura')
    .maybeSingle();
  const start = new Date(
    connection?.last_synced_at
      ? Date.parse(connection.last_synced_at) - 3 * 86400000
      : Date.now() - 365 * 86400000,
  )
    .toISOString()
    .slice(0, 10);
  const end = new Date().toISOString().slice(0, 10);
  let count = 0;
  try {
    for (const endpoint of ['daily_sleep', 'daily_readiness', 'daily_activity', 'sleep']) {
      let next: string | undefined;
      let page = 0;
      do {
        const url = new URL(`https://api.ouraring.com/v2/usercollection/${endpoint}`);
        url.searchParams.set('start_date', start);
        url.searchParams.set('end_date', end);
        if (next) url.searchParams.set('next_token', next);
        const result = await ouraGet(url.toString(), t.access_token);
        const now = new Date().toISOString();
        const records = (result.data || []).map((r: Record<string, unknown>) => ({
          source: 'oura',
          externalId: `${endpoint}:${r.id}`,
          kind: endpoint === 'sleep' ? 'measurement' : 'daily_summary',
          measuredAt: r.timestamp || r.bedtime_start || `${r.day}T12:00:00+09:00`,
          timezone: 'Asia/Seoul',
          data: {
            ...r,
            recordType: endpoint,
            ...(endpoint === 'daily_sleep'
              ? { sleep_score: r.score }
              : endpoint === 'daily_readiness'
                ? { readiness_score: r.score }
                : endpoint === 'daily_activity'
                  ? { activity_score: r.score }
                  : {}),
            ...(endpoint === 'sleep'
              ? {
                  sleep_duration: r.total_sleep_duration,
                  resting_heart_rate: r.lowest_heart_rate,
                  hrv: r.average_hrv,
                }
              : {}),
          },
          updatedAt: now,
        }));
        for (let i = 0; i < records.length; i += 100) {
          count += await rpc('health_ingest', {
            p_user: id,
            p_batch: `oura:${crypto.randomUUID()}`,
            p_records: records.slice(i, i + 100),
          });
        }
        next = result.next_token;
        page++;
        if (page > 1000) throw new Error('Oura pagination limit');
      } while (next);
    }
    await db().from('connections').upsert(
      {
        user_id: id,
        source: 'oura',
        status: 'connected',
        last_synced_at: new Date().toISOString(),
        error_code: null,
        last_error: null,
      },
      { onConflict: 'user_id,source' },
    );
    return count;
  } catch (e) {
    await db()
      .from('connections')
      .update({
        status:
          e instanceof Error && e.message === 'Oura permission revoked' ? 'reauthorize' : 'error',
        error_code:
          e instanceof Error && e.message === 'Oura permission revoked'
            ? 'permission_revoked'
            : 'sync_failed',
        last_error: 'Oura 동기화 실패. 권한과 연결 상태를 확인하세요.',
      })
      .eq('user_id', id)
      .eq('source', 'oura');
    throw e;
  }
}
