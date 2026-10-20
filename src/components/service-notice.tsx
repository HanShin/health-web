import Link from 'next/link';
import type { ReactNode } from 'react';

export function ServiceNotice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="service-notice">
      <Link className="service-notice-back" href="/">
        ← 오늘의 건강
      </Link>
      <article>
        <span className="eyebrow">HEALTH WEB</span>
        <h1>{title}</h1>
        <p className="service-notice-date">적용일: 2026년 10월 20일</p>
        {children}
      </article>
      <nav aria-label="서비스 안내">
        <Link href="/privacy">개인정보 처리 안내</Link>
        <Link href="/terms">서비스 이용 안내</Link>
        <Link href="/login">로그인</Link>
      </nav>
    </main>
  );
}
