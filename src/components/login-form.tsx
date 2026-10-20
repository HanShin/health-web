'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState(''),
    [token, setToken] = useState(''),
    [sent, setSent] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const r = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token: sent ? token : undefined }),
      });
      const result = await r.json();
      if (!r.ok) throw Error(result.error);
      if (sent) {
        router.push('/');
        router.refresh();
      } else {
        setSent(true);
        setMessage('이메일로 보낸 인증 코드를 입력해 주세요.');
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '로그인 실패');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="auth-form">
      <label>
        이메일
        <input
          required
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={sent}
        />
      </label>
      {sent && (
        <label>
          인증 코드
          <input
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        </label>
      )}
      <button disabled={busy}>
        {busy ? '처리 중…' : sent ? '로그인' : '인증 코드 받기'} <span>→</span>
      </button>
      {sent && (
        <button
          type="button"
          className="text-button"
          disabled={busy}
          onClick={() => {
            setSent(false);
            setToken('');
            setMessage('');
          }}
        >
          이메일 변경 · 코드 다시 받기
        </button>
      )}
      {message && <p role="status">{message}</p>}
    </form>
  );
}
