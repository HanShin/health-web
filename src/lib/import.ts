import { z } from 'zod';
import type { IncomingRecord } from './health';
const obj = z.record(z.string(), z.unknown());
const schema = z.object({
  schemaVersion: z.literal(5),
  analysis: z.object({
    schemaVersion: z.literal(3),
    metadata: z.object({ exportTimeZoneId: z.string(), exportedAtUtc: z.iso.datetime() }),
    runningSessions: z.array(obj),
    bodyMeasurements: z.array(obj),
    inBodyRecords: z.array(obj).optional(),
  }),
});
function object(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function iso(value: unknown, fallback: string) {
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value).toISOString();
  if (typeof value === 'string' && Number.isFinite(Date.parse(value)))
    return new Date(value).toISOString();
  return fallback;
}
function id(value: unknown) {
  if (typeof value !== 'string' || !value || value.length > 400)
    throw Error('원본 기록 ID가 올바르지 않습니다.');
  return value;
}
export function parseHealthTask(input: unknown): IncomingRecord[] {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw Error(
      '오늘러닝의 schemaVersion 5 / analysis 3 상세 데이터 내보내기 파일을 선택해 주세요.',
    );
  const { analysis: a } = parsed.data,
    timezone = a.metadata.exportTimeZoneId;
  const records: IncomingRecord[] = [];
  for (const run of a.runningSessions) {
    const session = object(object(run.record).session),
      calc = object(run.calculations);
    const measuredAt = iso(run.startedAtUtc, iso(session.startedAt, a.metadata.exportedAtUtc));
    records.push({
      source: 'health_task',
      externalId: id(run.sessionId),
      kind: 'workout',
      measuredAt,
      timezone,
      updatedAt: iso(session.updatedAt, measuredAt),
      data: {
        ...run,
        distanceMeters: calc.distanceMeters ?? null,
        activeDurationMillis: calc.activeDurationMillis ?? null,
        averageHeartRateBpm: session.averageHeartRateBpm ?? null,
        caloriesKcal: session.caloriesKcal ?? null,
      },
    });
  }
  for (const measurement of a.bodyMeasurements) {
    const record = object(measurement.record),
      measuredAt = iso(measurement.measuredAtUtc, iso(record.measuredAt, a.metadata.exportedAtUtc));
    records.push({
      source: 'health_task',
      externalId: id(record.id),
      kind: 'measurement',
      measuredAt,
      timezone,
      updatedAt: iso(record.updatedAt, measuredAt),
      data: {
        ...measurement,
        metric: record.type,
        value: record.value,
        unit: measurement.unit,
        sourcePackage: record.sourcePackage,
      },
    });
  }
  for (const row of a.inBodyRecords ?? []) {
    const measuredAt = iso(row.measuredAtUtc, a.metadata.exportedAtUtc);
    records.push({
      source: 'health_task',
      externalId: 'inbody:' + id(row.id),
      kind: 'measurement',
      measuredAt,
      timezone: String(row.assumedTimeZoneId ?? timezone),
      updatedAt: measuredAt,
      data: { ...row, recordType: 'inbody_raw' },
    });
  }
  if (!records.length) throw Error('가져올 러닝·체성분 기록이 없습니다.');
  return records;
}
export async function splitDetail(record: IncomingRecord): Promise<IncomingRecord[]> {
  const json = JSON.stringify(record.data);
  if (json.length <= 32000) return [record];
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(json))),
  )
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
  const count = Math.ceil(json.length / 32000),
    parts: IncomingRecord[] = [];
  for (let i = 0; i < count; i++)
    parts.push({
      ...record,
      externalId: `${record.externalId}:part:${hash}:${i}`,
      data: {
        recordType: 'detail_part',
        parentExternalId: record.externalId,
        contentHash: hash,
        partIndex: i,
        partCount: count,
        jsonPart: json.slice(i * 32000, (i + 1) * 32000),
      },
    });
  const data = { ...record.data };
  for (const k of ['sensorTelemetry', 'routePoints', 'laps', 'samples', 'stages', 'rawFields'])
    delete data[k];
  const raw = object(data.record);
  if (raw.session) {
    const session = { ...object(raw.session) };
    delete session.routePolyline;
    delete session.lapData;
    data.record = { ...raw, session };
  }
  // Preserve any other unexpectedly large raw fields in detail parts; keep a compact readable parent.
  if (JSON.stringify(data).length > 60000) {
    for (const key of Object.keys(data)) if (typeof data[key] === 'object') delete data[key];
  }
  return [
    ...parts,
    { ...record, data: { ...data, detailContentHash: hash, detailPartCount: count } },
  ];
}
export function ingestionBatches(records: IncomingRecord[]): IncomingRecord[][] {
  const batches: IncomingRecord[][] = [];
  let batch: IncomingRecord[] = [],
    bytes = 0;
  for (const record of records) {
    const size = new TextEncoder().encode(JSON.stringify(record)).length + 1;
    if (size > 1_800_000) throw Error('단일 원본 기록이 너무 큽니다.');
    if (batch.length >= 100 || bytes + size > 1_800_000) {
      batches.push(batch);
      batch = [];
      bytes = 0;
    }
    batch.push(record);
    bytes += size;
  }
  if (batch.length) batches.push(batch);
  return batches;
}
export async function importBatchId(records: IncomingRecord[]) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(records)),
  );
  return (
    'web:' + Array.from(new Uint8Array(digest), (x) => x.toString(16).padStart(2, '0')).join('')
  );
}
