import { ouraGet, ouraExchange } from './oura-http.ts';
function mock(responses: Response[]): typeof fetch {
  return (() => Promise.resolve(responses.shift()!)) as typeof fetch;
}
Deno.test('Oura retries 429 and 5xx and returns page token', async () => {
  const waits: number[] = [];
  const result = await ouraGet(
    'https://example.test',
    'access',
    mock([
      new Response('', { status: 429, headers: { 'retry-after': '2' } }),
      new Response('', { status: 503 }),
      Response.json({ data: [{ id: 'one' }], next_token: 'next' }),
    ]),
    async (ms) => {
      waits.push(ms);
    },
  );
  if (result.next_token !== 'next' || waits.length !== 2 || waits[0] !== 2000)
    throw new Error('Retry failure');
});
Deno.test('Oura permission revocation fails without retry', async () => {
  let failed = false;
  try {
    await ouraGet('https://example.test', 'access', mock([new Response('', { status: 401 })]));
  } catch (e) {
    failed = e instanceof Error && e.message === 'Oura permission revoked';
  }
  if (!failed) throw new Error('Expected revoked error');
});
Deno.test('Oura repeated failure is bounded to three attempts', async () => {
  let failed = false;
  try {
    await ouraGet(
      'https://example.test',
      'access',
      mock(Array.from({ length: 3 }, () => new Response('', { status: 503 }))),
      async () => {},
    );
  } catch {
    failed = true;
  }
  if (!failed) throw new Error('Expected bounded failure');
});
Deno.test('Oura refresh sends refresh grant and receives rotated token', async () => {
  const fetcher: typeof fetch = async (_input, init) => {
    const params = init?.body as URLSearchParams;
    if (
      params.get('grant_type') !== 'refresh_token' ||
      params.get('refresh_token') !== 'old' ||
      params.get('client_secret') !== 'secret'
    )
      throw new Error('Invalid refresh body');
    return Response.json({
      access_token: 'new-access',
      refresh_token: 'new-refresh',
      expires_in: 3600,
    });
  };
  const t = await ouraExchange(
    { grant_type: 'refresh_token', refresh_token: 'old' },
    'client',
    'secret',
    fetcher,
  );
  if (t.refresh_token !== 'new-refresh') throw new Error('Expected rotated token');
});
Deno.test('Oura failed refresh rejects invalid credentials', async () => {
  let failed = false;
  try {
    await ouraExchange(
      { grant_type: 'refresh_token', refresh_token: 'expired' },
      'client',
      'secret',
      mock([new Response('', { status: 400 })]),
    );
  } catch {
    failed = true;
  }
  if (!failed) throw new Error('Expected refresh failure');
});
Deno.test('Oura temporary refresh outage remains retryable', async () => {
  try {
    await ouraExchange(
      { grant_type: 'refresh_token', refresh_token: 'valid' },
      'client',
      'secret',
      mock([new Response('', { status: 503 })]),
    );
    throw new Error('Expected failure');
  } catch (e) {
    if (!(e instanceof Error) || e.message !== 'Oura temporarily unavailable') throw e;
  }
});
