import { body, hash, json, rpc, secret, serve, user } from '../_shared/core.ts';
serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const b = await body(req);
  if (b.action === 'claim') {
    if (
      typeof b.code !== 'string' ||
      !/^[a-f0-9]{32}$/.test(b.code) ||
      typeof b.deviceName !== 'string' ||
      !b.deviceName.trim()
    )
      throw new Error('Invalid claim');
    const token = 'ht_' + secret();
    const deviceId = await rpc('health_pair_claim', {
      p_hash: await hash(b.code),
      p_token_hash: await hash(token),
      p_name: b.deviceName,
    });
    return json({ deviceId, token });
  }
  if (b.action === 'revoke-self') {
    await user(req, true);
    const token = req.headers.get('Authorization')!.replace(/^Bearer /, '');
    if (!token.startsWith('ht_')) throw new Error('Forbidden');
    await rpc('health_revoke_self', { p_hash: await hash(token) });
    return json({ revoked: true });
  }
  const id = await user(req);
  if (b.action === 'create') {
    const code = secret().slice(0, 32);
    await rpc('health_pair_create', { p_user: id, p_hash: await hash(code) });
    return json({ code, expiresAt: new Date(Date.now() + 600_000).toISOString() });
  }
  if (b.action === 'revoke' && typeof b.deviceId === 'string') {
    await rpc('health_revoke_device', { p_user: id, p_device: b.deviceId });
    return json({ revoked: true });
  }
  throw new Error('Unknown action');
});
