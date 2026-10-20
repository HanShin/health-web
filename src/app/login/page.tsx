import Link from 'next/link';
import { redirect } from 'next/navigation';
import { configured, isAllowed } from '@/lib/config';
import { supabase } from '@/lib/supabase/server';
import { LoginForm } from '@/components/login-form';
export const dynamic = 'force-dynamic';
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ auth?: string }>;
}) {
  if (configured) {
    const db = await supabase();
    const {
      data: { user },
    } = await db.auth.getUser();
    if (user && isAllowed(user.email)) redirect('/');
  }
  const { auth } = await searchParams;
  const message =
    auth === 'not-allowed'
      ? '허용된 이메일의 Google 계정으로 로그인해 주세요.'
      : auth === 'google-failed'
        ? 'Google 로그인을 완료하지 못했습니다. 로그인을 시작한 브라우저에서 다시 시도해 주세요.'
        : '';
  return (
    <main className="login">
      <div className="auth-card">
        <div className="brand-mark">
          h<span>✳</span>
        </div>
        <span className="eyebrow">YOUR HEALTH, TOGETHER</span>
        <h1>
          나를 이해하는
          <br />
          건강 기록의 시작.
        </h1>
        <p>
          Oura의 회복부터 러닝과 인바디까지.
          <br />
          흩어진 기록을 한 곳에서 이어 보세요.
        </p>
        {configured ? (
          <LoginForm initialMessage={message} />
        ) : (
          <div className="notice">
            Supabase 연결 설정이 필요합니다. .env.example을 참고해 공개 키와 허용 이메일을
            설정하세요.
          </div>
        )}
        <Link className="demo-link" href="/demo">
          샘플 데이터로 먼저 둘러보기 ↗
        </Link>
        <small>허용된 이메일로만 로그인할 수 있습니다.</small>
        <nav className="login-notice-links" aria-label="서비스 안내">
          <Link href="/privacy">개인정보 처리 안내</Link>
          <Link href="/terms">서비스 이용 안내</Link>
        </nav>
      </div>
      <div className="login-art">
        <span>하나의 흐름으로 보는</span>
        <strong>나의 건강.</strong>
        <div className="orbit o1" />
        <div className="orbit o2" />
        <div className="orbit o3" />
        <p>SLEEP · MOVE · RECOVER</p>
      </div>
    </main>
  );
}
