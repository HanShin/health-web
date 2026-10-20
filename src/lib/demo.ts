import type { HealthRecord, Connection } from './health';
export const demoConnections: Connection[] = [
  { source: 'oura', status: 'connected' },
  { source: 'health_task', status: 'connected' },
  { source: 'health_connect', status: 'connected' },
];
export function demoRecords(): HealthRecord[] {
  const records: HealthRecord[] = [];
  const now = new Date();
  for (let i = 0; i < 90; i++) {
    const at = new Date(now.getTime() - i * 86400000).toISOString();
    const add = (
      source: HealthRecord['source'],
      kind: HealthRecord['kind'],
      id: string,
      data: Record<string, unknown>,
    ) =>
      records.push({
        source,
        kind,
        external_id: `demo-${id}-${i}`,
        measured_at: at,
        timezone: 'Asia/Seoul',
        data,
      });
    add('oura', 'daily_summary', 'oura', {
      sleep_score: Math.round(82 + Math.sin(i * 1.4) * 9),
      readiness_score: Math.round(85 + Math.cos(i) * 7),
      sleep_duration: Math.round(26600 + Math.sin(i) * 3000),
      resting_heart_rate: Math.round(54 + Math.sin(i) * 4),
      hrv: Math.round(48 + Math.cos(i) * 9),
      steps: Math.round(8500 + Math.sin(i * 0.8) * 3000),
      activity_score: Math.round(87 + Math.cos(i) * 5),
    });
    if (i % 3 === 0)
      add('health_task', 'workout', 'run', {
        distanceMeters: Math.round((5 + Math.sin(i) * 1.5) * 1000),
        activeDurationMillis: Math.round((31 + Math.sin(i) * 8) * 60000),
        averageHeartRateBpm: 146 + (i % 12),
        caloriesKcal: 330 + (i % 80),
        includedInSummary: true,
        title: '아침 러닝',
      });
    if (i % 7 === 0)
      for (const [m, v, u] of [
        ['WEIGHT_KG', 72.4 + i * 0.02, 'kg'],
        ['BODY_FAT_PERCENT', 18.2 + i * 0.015, '%'],
        ['SKELETAL_MUSCLE_KG', 33.8 - i * 0.004, 'kg'],
      ] as const)
        add('health_task', 'measurement', m, {
          metric: m,
          value: Number(v.toFixed(1)),
          unit: u,
          sourcePackage: 'com.inbody2014.inbody',
        });
  }
  return records.sort((a, b) => b.measured_at.localeCompare(a.measured_at));
}
