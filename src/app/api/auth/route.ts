import { NextResponse } from 'next/server';
import { configured, isAllowed } from '@/lib/config';
import { supabase } from '@/lib/supabase/server';
import { isSameOrigin } from '@/lib/request-origin';
export async function POST(request: Request) {
  if (!configured)
    return NextResponse.json({ error: 'Supabase 설정이 필요합니다.' }, { status: 503 });
  if (!isSameOrigin(request))
    return NextResponse.json({ error: '허용되지 않은 요청입니다.' }, { status: 403 });
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: '올바른 요청이 필요합니다.' }, { status: 400 });
  }
  const data = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
  const token = data.token;
  if (!isAllowed(email))
    return NextResponse.json({ error: '허용된 이메일을 확인해 주세요.' }, { status: 403 });
  if (token !== undefined && (typeof token !== 'string' || !/^\d{6,10}$/.test(token)))
    return NextResponse.json(
      { error: '이메일에 받은 인증 코드를 입력해 주세요.' },
      { status: 400 },
    );
  const db = await supabase();
  const result =
    typeof token === 'string'
      ? await db.auth.verifyOtp({ email, token, type: 'email' })
      : await db.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  if (result.error) {
    // Log only safe diagnostics; never include email addresses, codes or session data.
    console.error('Supabase email authentication failed', {
      action: typeof token === 'string' ? 'verify' : 'send',
      code: result.error.code,
      status: result.error.status,
    });
  }
  const sendError =
    result.error?.status === 429
      ? '요청이 많습니다. 잠시 후 인증 코드를 다시 요청해 주세요.'
      : result.error?.code === 'signup_disabled' || result.error?.code === 'otp_disabled'
        ? '계정 등록 또는 최초 이메일 인증이 필요합니다. 받은 초대 메일을 수락한 뒤 다시 시도해 주세요.'
        : '코드 전송에 실패했습니다. 계정 등록과 메일 설정을 확인해 주세요.';
  return result.error
    ? NextResponse.json(
        {
          error: token ? '인증 코드가 올바르지 않거나 만료되었습니다.' : sendError,
        },
        { status: 400 },
      )
    : NextResponse.json({ ok: true });
}
