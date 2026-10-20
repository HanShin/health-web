import { redirect } from 'next/navigation';
import { configured, isAllowed } from '@/lib/config';
import { supabase } from '@/lib/supabase/server';
import { Dashboard } from '@/components/dashboard';
import type { HealthRecord, Connection, SyncRun, Device } from '@/lib/health';
export const dynamic = 'force-dynamic';
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; oura?: string }>;
}) {
  if (!configured) redirect('/login');
  const db = await supabase();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user || !isAllowed(user.email)) redirect('/login');
  const { view, oura } = await searchParams;
  async function readRecords() {
    const data: HealthRecord[] = [];
    for (let offset = 0; ; offset += 1000) {
      const result = await db
        .from('health_records')
        .select('*')
        .is('deleted_at', null)
        .or('data->>recordType.is.null,data->>recordType.neq.detail_part')
        .order('measured_at', { ascending: false })
        .order('id')
        .range(offset, offset + 999);
      if (result.error) return { data: [], error: result.error };
      data.push(...(result.data as HealthRecord[]));
      if (result.data.length < 1000) break;
    }
    return { data, error: null };
  }
  const results = await Promise.all([
    readRecords(),
    db.from('connections').select('*'),
    db.from('sync_runs').select('*').order('started_at', { ascending: false }).limit(20),
    db.from('devices').select('id,name,last_seen_at,revoked_at'),
  ]);
  const failed = results.some((r) => r.error);
  return (
    <Dashboard
      demo={false}
      initialTab={view === 'settings' ? 'settings' : undefined}
      initialMessage={
        oura === 'connected'
          ? 'Oura가 연결되었습니다. 초기 수집이 끝나면 새로고침해 주세요.'
          : oura === 'denied'
            ? 'Oura 연결을 취소했습니다.'
            : undefined
      }
      email={user.email!}
      records={(results[0].data ?? []) as HealthRecord[]}
      connections={(results[1].data ?? []) as Connection[]}
      runs={(results[2].data ?? []) as SyncRun[]}
      devices={(results[3].data ?? []) as Device[]}
      loadError={
        failed
          ? '데이터 조회에 실패했습니다. Supabase 마이그레이션과 연결을 확인해 주세요.'
          : undefined
      }
    />
  );
}
