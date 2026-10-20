import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { errorStatus, HttpError } from './errors.ts';
export const env = (key: string) => {
  const v = Deno.env.get(key);
  if (!v) throw new Error(`Missing ${key}`);
  return v;
};
export const db = () =>
  createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  });
export async function assertAllowedUser(id: string) {
  const client = db();
  const { data, error } = await client.auth.admin.getUserById(id);
  if (error) throw error;
  if (!data.user?.email) throw new Error('Forbidden');
  const { data: allowed, error: accessError } = await client
    .from('allowed_emails')
    .select('email')
    .eq('email', data.user.email.toLowerCase())
    .maybeSingle();
  if (accessError) throw accessError;
  if (!allowed) throw new Error('Forbidden');
}
export const headers = () => ({
  'Access-Control-Allow-Origin': env('WEB_ORIGIN'),
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  Vary: 'Origin',
});
export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...headers(), 'Content-Type': 'application/json' },
  });
export async function hash(s: string) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');
}
export function secret() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (v) =>
    v.toString(16).padStart(2, '0'),
  ).join('');
}
export async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await db().rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}
export async function user(req: Request, device = false): Promise<string> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer /, '');
  if (!token) throw new Error('Unauthorized');
  if (device && token.startsWith('ht_')) {
    const id = await rpc('health_device_user', { p_hash: await hash(token) });
    if (!id) throw new Error('Unauthorized');
    return id;
  }
  const { data, error } = await db().auth.getUser(token);
  if (error) {
    if (
      error.name === 'AuthRetryableFetchError' ||
      error.status === 0 ||
      (error.status && error.status >= 500)
    )
      throw new HttpError(503, 'Authentication temporarily unavailable');
    throw new Error('Unauthorized');
  }
  if (!data.user?.email) throw new Error('Unauthorized');
  const { data: allowed, error: accessError } = await db()
    .from('allowed_emails')
    .select('email')
    .eq('email', data.user.email.toLowerCase())
    .maybeSingle();
  if (accessError) throw accessError;
  if (!allowed) throw new Error('Forbidden');
  return data.user.id;
}
export async function body(req: Request) {
  const text = await req.text();
  if (new TextEncoder().encode(text).length > 2_000_000) throw new Error('Request too large');
  try {
    const b = JSON.parse(text);
    if (!b || typeof b !== 'object' || Array.isArray(b)) throw new Error();
    return b;
  } catch {
    throw new HttpError(400, 'Invalid JSON body');
  }
}
export function serve(fn: (r: Request) => Promise<Response>) {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response(null, { headers: headers() });
    try {
      return await fn(req);
    } catch (e) {
      const status = errorStatus(e);
      console.error('Request failed', {
        status,
        name: e instanceof Error ? e.name : 'UnknownError',
      });
      return json(
        {
          error:
            status >= 500
              ? 'Service temporarily unavailable'
              : status === 409
                ? 'Sync already running'
                : status === 413
                  ? 'Request too large'
                  : status === 401
                    ? 'Unauthorized'
                    : status === 403
                      ? 'Forbidden'
                      : 'Invalid request',
        },
        status,
      );
    }
  });
}
export async function encrypt(value: unknown) {
  const key = await crypto.subtle.importKey(
    'raw',
    Uint8Array.from(atob(env('OURA_ENCRYPTION_KEY')), (c) => c.charCodeAt(0)),
    { name: 'AES-GCM' },
    false,
    ['encrypt'],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(JSON.stringify(value)),
    ),
  );
  return btoa(String.fromCharCode(...iv, ...cipher));
}
export async function decrypt(value: string) {
  const bytes = Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    'raw',
    Uint8Array.from(atob(env('OURA_ENCRYPTION_KEY')), (c) => c.charCodeAt(0)),
    { name: 'AES-GCM' },
    false,
    ['decrypt'],
  );
  return JSON.parse(
    new TextDecoder().decode(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: bytes.slice(0, 12) },
        key,
        bytes.slice(12),
      ),
    ),
  );
}
