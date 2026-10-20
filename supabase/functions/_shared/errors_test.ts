import { errorStatus, HttpError } from './errors.ts';
Deno.test('only known input errors are permanent HTTP failures', () => {
  for (const m of ['Invalid batch', 'Invalid record', 'Invalid or expired code'])
    if (errorStatus(new Error(m)) !== 400) throw new Error(m);
});
Deno.test('network and database failures remain retryable', () => {
  for (const e of [
    new TypeError('fetch failed'),
    new Error('database unavailable'),
    { code: '08006' },
  ])
    if (errorStatus(e) !== 500) throw new Error('Expected retryable status');
});
Deno.test('auth, lease and payload statuses are preserved', () => {
  const cases: [unknown, number][] = [
    [new Error('Unauthorized'), 401],
    [new Error('Forbidden'), 403],
    [new Error('Sync already running'), 409],
    [new Error('Request too large'), 413],
    [new HttpError(503, 'auth unavailable'), 503],
  ];
  for (const [e, status] of cases)
    if (errorStatus(e) !== status) throw new Error('Wrong error status');
});
