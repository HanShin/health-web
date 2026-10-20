import { NextResponse } from 'next/server';
import { configured, isAllowed } from '@/lib/config';
import { authOrigin } from '@/lib/auth-origin';
import { supabase } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const origin = authOrigin(process.env.NEXT_PUBLIC_APP_URL);
  if (!configured || !origin) return new Response('로그인을 준비하고 있습니다.', { status: 503 });
  const params = new URL(request.url).searchParams;
  const fail = (reason: 'google-failed' | 'not-allowed') =>
    NextResponse.redirect(new URL(`/login?auth=${reason}`, origin));
  const code = params.get('code');
  if (!code || params.has('error')) return fail('google-failed');
  try {
    const db = await supabase();
    const { data, error } = await db.auth.exchangeCodeForSession(code);
    if (error) {
      console.error('Google login exchange failed', { code: error.code, status: error.status });
      return fail('google-failed');
    }
    if (!data.user?.email_confirmed_at || !isAllowed(data.user.email)) {
      await db.auth.signOut({ scope: 'local' });
      return fail('not-allowed');
    }
    return NextResponse.redirect(new URL('/', origin));
  } catch {
    return fail('google-failed');
  }
}
