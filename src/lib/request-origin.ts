/** Next's internal URL can use localhost even when the browser connects to 127.0.0.1.
 * Match the browser Origin against the HTTP Host and request protocol, never arbitrary origins.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    const requestUrl = new URL(request.url);
    const expected = new URL(
      `${requestUrl.protocol}//${request.headers.get('host') ?? requestUrl.host}`,
    );
    if (
      expected.username ||
      expected.password ||
      expected.pathname !== '/' ||
      expected.search ||
      expected.hash
    )
      return false;
    return origin === expected.origin;
  } catch {
    return false;
  }
}
