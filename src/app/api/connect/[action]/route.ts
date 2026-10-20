import { NextResponse } from 'next/server';
import { configured, isAllowed } from '@/lib/config';
import { supabase } from '@/lib/supabase/server';
import { isSameOrigin } from '@/lib/request-origin';
const targets: Record<string, { fn: string; action?: string }> = {
  pair: { fn: 'device-pair', action: 'create' },
  revoke: { fn: 'device-pair', action: 'revoke' },
  oura: { fn: 'oura-connect', action: 'authorize' },
  disconnect: { fn: 'oura-connect', action: 'disconnect' },
  sync: { fn: 'oura-sync' },
  ingest: { fn: 'health-ingest' },
};
export async function POST(request: Request, { params }: { params: Promise<{ action: string }> }) {
  if (!configured)
    return NextResponse.json({ error: 'Supabase가 설정되지 않았습니다.' }, { status: 503 });
  if (!isSameOrigin(request))
    return NextResponse.json({ error: '허용되지 않은 요청입니다.' }, { status: 403 });
  const { action } = await params,
    target = Object.hasOwn(targets, action) ? targets[action] : undefined;
  if (!target) return NextResponse.json({ error: '알 수 없는 작업입니다.' }, { status: 404 });
  const client = await supabase();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user || !isAllowed(user.email))
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '올바른 JSON이 필요합니다.' }, { status: 400 });
  }
  const {
    data: { session },
  } = await client.auth.getSession();
  if (!session) return NextResponse.json({ error: '다시 로그인해 주세요.' }, { status: 401 });
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${target.fn}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      },
      body: JSON.stringify({ ...body, ...(target.action ? { action: target.action } : {}) }),
      cache: 'no-store',
      signal: AbortSignal.timeout(120000),
    },
  ).catch(() => null);
  if (!response)
    return NextResponse.json(
      { error: '수집 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 503 },
    );
  const text = await response.text();
  return new Response(text, {
    status: response.status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
