export async function ouraGet(
  path: string,
  token: string,
  fetcher: typeof fetch = fetch,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetcher(path, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20000),
    });
    if (res.status === 429 || res.status >= 500) {
      if (attempt === 2) throw new Error('Oura temporarily unavailable');
      const retry = Number(res.headers.get('retry-after') || 1);
      await sleep(Number.isFinite(retry) ? Math.min(Math.max(retry * 1000, 250), 5000) : 1000);
      continue;
    }
    if (res.status === 401 || res.status === 403) throw new Error('Oura permission revoked');
    if (!res.ok) throw new Error('Oura request failed');
    return res.json();
  }
  throw new Error('Oura request failed');
}
export async function ouraExchange(
  params: Record<string, string>,
  clientId: string,
  clientSecret: string,
  fetcher: typeof fetch = fetch,
) {
  const res = await fetcher('https://api.ouraring.com/oauth/token', {
    method: 'POST',
    body: new URLSearchParams({ ...params, client_id: clientId, client_secret: clientSecret }),
    signal: AbortSignal.timeout(20000),
  });
  if (res.status === 429 || res.status >= 500) throw new Error('Oura temporarily unavailable');
  if (!res.ok) throw new Error('Oura authorization failed');
  const t = await res.json();
  if (
    typeof t.access_token !== 'string' ||
    !Number.isFinite(Number(t.expires_in)) ||
    Number(t.expires_in) <= 0
  )
    throw new Error('Invalid Oura token response');
  return t;
}
