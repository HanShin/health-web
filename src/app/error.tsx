'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="auth-card">
      <h1>데이터를 불러오지 못했어요</h1>
      <p>네트워크와 Supabase 설정을 확인한 뒤 다시 시도해 주세요.</p>
      <button onClick={reset}>다시 시도</button>
    </main>
  );
}
