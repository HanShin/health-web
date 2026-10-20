import { NextResponse } from 'next/server';
import { configured } from '@/lib/config';
import { authOrigin } from '@/lib/auth-origin';
import { isSameOrigin } from '@/lib/request-origin';
import { supabase } from '@/lib/supabase/server';

export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return NextResponse.json({ error: '허용되지 않은 요청입니다.' }, { status: 403 });
  const origin = authOrigin(process.env.NEXT_PUBLIC_APP_URL);
  const unavailable = () =>
    NextResponse.json(
      { error: '지금은 Google 로그인을 이용할 수 없습니다. 이메일 코드로 로그인해 주세요.' },
      { status: 503 },
    );
  if (!configured || !origin) return unavailable();
  try {
    const settings = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY! },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!settings.ok || (await settings.json()).external?.google !== true) return unavailable();
    const db = await supabase();
    const { data, error } = await db.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${origin}/auth/callback`, skipBrowserRedirect: true },
    });
    if (error || !data.url) {
      console.error('Google login initiation failed', { code: error?.code, status: error?.status });
      return unavailable();
    }
    return NextResponse.json({ url: data.url });
  } catch {
    return unavailable();
  }
}
