import {
  assertAllowedUser,
  body,
  db,
  env,
  hash,
  json,
  rpc,
  secret,
  serve,
  user,
} from '../_shared/core.ts';
import { exchange, saveToken, syncOura } from '../_shared/oura.ts';
declare const EdgeRuntime: { waitUntil: (task: Promise<unknown>) => void };
serve(async (req) => {
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const state = url.searchParams.get('state');
    if (!state) throw new Error('Invalid OAuth state');
    const id = await rpc('health_oauth_claim', { p_hash: await hash(state) });
    if (!id) throw new Error('Invalid OAuth state');
    await assertAllowedUser(id);
    if (url.searchParams.get('error'))
      return Response.redirect(`${env('WEB_ORIGIN')}/connections?oura=denied`, 303);
    if (!url.searchParams.get('code')) throw new Error('OAuth denied');
    const t = await exchange({
      grant_type: 'authorization_code',
      code: url.searchParams.get('code')!,
      redirect_uri: env('OURA_REDIRECT_URI'),
    });
    await saveToken(id, t);
    const { error } = await db()
      .from('connections')
      .upsert(
        { user_id: id, source: 'oura', status: 'connected', error_code: null, last_error: null },
        { onConflict: 'user_id,source' },
      );
    if (error) throw error;
    // Hosted Edge Runtime retains this task after the redirect; cron retries failures.
    EdgeRuntime.waitUntil(
      syncOura(id).catch(() => {
        console.error('Initial Oura sync failed; see sync_runs');
      }),
    );
    return Response.redirect(`${env('WEB_ORIGIN')}/connections?oura=connected`, 303);
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const id = await user(req);
  const b = await body(req);
  if (b.action === 'disconnect') {
    const lease = crypto.randomUUID();
    if (!(await rpc('health_oura_lock', { p_user: id, p_lease: lease })))
      throw new Error('Sync already running');
    try {
      await rpc('health_oura_token', { p_user: id, p_delete: true });
      await db()
        .from('connections')
        .update({ status: 'disconnected', error_code: null, last_error: null })
        .eq('user_id', id)
        .eq('source', 'oura');
      return json({ disconnected: true });
    } finally {
      await rpc('health_oura_lock', { p_user: id, p_lease: lease, p_release: true });
    }
  }
  if (b.action !== 'authorize') throw new Error('Unknown action');
  const state = secret();
  await rpc('health_oauth_state', { p_user: id, p_hash: await hash(state) });
  const url = new URL('https://cloud.ouraring.com/oauth/authorize');
  for (const [k, v] of Object.entries({
    client_id: env('OURA_CLIENT_ID'),
    redirect_uri: env('OURA_REDIRECT_URI'),
    response_type: 'code',
    scope: 'daily heartrate',
    state,
  }))
    url.searchParams.set(k, v);
  return json({ url: url.toString() });
});
