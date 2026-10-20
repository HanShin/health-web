import { inbodyLabels } from './inbody';
export type Source = 'health_task' | 'health_connect' | 'oura' | 'apple_health';
export type Kind = 'workout' | 'measurement' | 'daily_summary';
export interface HealthRecord {
  id?: string;
  source: Source;
  external_id: string;
  kind: Kind;
  measured_at: string;
  timezone: string;
  data: Record<string, unknown>;
  source_updated_at?: string;
  deleted_at?: string | null;
}
export interface Connection {
  id?: string;
  provider?: string;
  source?: string;
  status: string;
  last_synced_at?: string | null;
  last_error?: string | null;
}
export interface SyncRun {
  id: string;
  source?: string;
  provider?: string;
  status: string;
  started_at: string;
  finished_at?: string | null;
  error?: string | null;
  record_count?: number;
}
export interface Device {
  id: string;
  name: string;
  last_seen_at: string | null;
  revoked_at: string | null;
}
export interface IncomingRecord {
  source: Source;
  externalId: string;
  kind: Kind;
  measuredAt: string;
  timezone: string;
  data: Record<string, unknown>;
  updatedAt: string;
  deleted?: boolean;
}
export const sourceNames: Record<Source, string> = {
  health_task: '오늘러닝 · 인바디',
  health_connect: '삼성 헬스',
  oura: 'Oura Ring',
  apple_health: '애플 건강',
};
export function sourceGroup(r: HealthRecord): Source {
  const raw = r.data.record as
    { sourcePackage?: string; session?: { sourcePackage?: string } } | undefined;
  const pkg = r.data.sourcePackage ?? raw?.sourcePackage ?? raw?.session?.sourcePackage;
  return pkg === 'com.sec.android.app.shealth' ? 'health_connect' : r.source;
}
export function sourceLabel(r: HealthRecord) {
  const raw = r.data.record as
    { sourcePackage?: string; session?: { sourcePackage?: string } } | undefined;
  const pkg = r.data.sourcePackage ?? raw?.sourcePackage ?? raw?.session?.sourcePackage;
  return pkg === 'com.nike.plusgps' ? 'Nike Run Club' : sourceNames[sourceGroup(r)];
}
export const metricNames: Record<string, string> = {
  ...inbodyLabels,
  weight: '체중',
  WEIGHT_KG: '체중',
  body_fat: '체지방률',
  BODY_FAT_PERCENT: '체지방률',
  SKELETAL_MUSCLE_KG: '골격근량',
  sleep_duration: '수면 시간',
  sleep_score: '수면 점수',
  readiness_score: '준비도',
  activity_score: '활동 점수',
  resting_heart_rate: '안정 심박',
  hrv: 'HRV',
  steps: '걸음 수',
  heart_rate: '심박',
};
export function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
export function dayOf(iso: string, timezone = 'Asia/Seoul') {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}
export function metric(record: HealthRecord): string {
  return String(record.data.metric ?? record.data.type ?? '');
}
export function valueFor(record: HealthRecord, key: string): number | null {
  const d = record.data;
  if (metric(record) === key) return num(d.value);
  return num(d[key]);
}
export function latestMetric(records: HealthRecord[], keys: string[], source?: Source) {
  for (const record of [...records].sort((a, b) => b.measured_at.localeCompare(a.measured_at))) {
    if (source && record.source !== source) continue;
    for (const key of keys) {
      const value = valueFor(record, key);
      if (value !== null) return { value, record };
    }
  }
  return null;
}
export function filterPeriod(records: HealthRecord[], days: number, now = new Date()) {
  const cutoff = now.getTime() - (days - 1) * 86400000;
  const firstDay = dayOf(new Date(cutoff).toISOString());
  return records.filter(
    (r) =>
      !r.deleted_at &&
      dayOf(r.measured_at) >= firstDay &&
      new Date(r.measured_at).getTime() <= now.getTime(),
  );
}
export function runningSummary(records: HealthRecord[]) {
  const runs = records.filter(
    (r) =>
      r.kind === 'workout' &&
      r.data.recordType !== 'detail_part' &&
      r.data.includedInSummary !== false &&
      !r.data.duplicateOfSessionId,
  );
  let distance = 0,
    duration = 0,
    knownDistance = 0,
    knownDuration = 0;
  for (const r of runs) {
    const d = num(r.data.distanceMeters),
      t = num(r.data.activeDurationMillis);
    if (d !== null) {
      distance += d;
      knownDistance++;
    }
    if (t !== null) {
      duration += t;
      knownDuration++;
    }
  }
  return {
    runs,
    distance: knownDistance ? distance : null,
    duration: knownDuration ? duration : null,
  };
}
export function formatNumber(n: number | null, digits = 0) {
  return n === null
    ? '—'
    : n.toLocaleString('ko-KR', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}
export function formatDuration(ms: number | null) {
  if (ms === null) return '—';
  return `${Math.floor(ms / 3600000)}시간 ${Math.floor(ms / 60000) % 60}분`;
}
