import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayOf, latestMetric, runningSummary, type HealthRecord } from '../src/lib/health';
import { parseHealthTask, splitDetail, ingestionBatches, importBatchId } from '../src/lib/import';
const r = (data: Record<string, unknown>): HealthRecord => ({
  source: 'health_task',
  external_id: 'run-1',
  kind: 'workout',
  measured_at: '2026-10-20T00:00:00Z',
  timezone: 'Asia/Seoul',
  data,
});
test('Seoul date, zero vs missing and duplicate summary', () => {
  assert.equal(dayOf('2026-10-19T16:00:00Z'), '2026-10-20');
  assert.equal(latestMetric([r({ metric: 'weight', value: 0 })], ['weight'])?.value, 0);
  assert.equal(latestMetric([r({ value: null })], ['weight']), null);
  assert.deepEqual(
    runningSummary([
      r({ distanceMeters: 5000, activeDurationMillis: 1800000 }),
      r({ distanceMeters: 5000, duplicateOfSessionId: 'run-1' }),
    ]).distance,
    5000,
  );
});
const payload = {
  schemaVersion: 5,
  analysis: {
    schemaVersion: 3,
    metadata: { exportTimeZoneId: 'Asia/Seoul', exportedAtUtc: '2026-10-20T01:00:00Z' },
    runningSessions: [
      {
        sessionId: 'one',
        startedAtUtc: '2026-10-20T00:00:00Z',
        record: { session: { updatedAt: 1792454400000 } },
        calculations: { distanceMeters: 5000 },
        includedInSummary: true,
      },
    ],
    bodyMeasurements: [],
  },
};
test('import stable IDs, timestamps and schema validation', () => {
  const a = parseHealthTask(payload),
    b = parseHealthTask(payload);
  assert.deepEqual(a, b);
  assert.equal(a[0].externalId, 'one');
  assert.equal(a[0].data.distanceMeters, 5000);
  assert.throws(() => parseHealthTask({ schemaVersion: 4 }));
});
test('large data children reconstruct original, parent published last', async () => {
  const original = {
    ...parseHealthTask(payload)[0],
    data: { distanceMeters: 5000, sensorTelemetry: { samples: 'x'.repeat(100000) } },
  };
  const parts = await splitDetail(original);
  assert.equal(parts.at(-1)?.externalId, 'one');
  assert.deepEqual(
    JSON.parse(
      parts
        .slice(0, -1)
        .map((p) => p.data.jsonPart)
        .join(''),
    ),
    original.data,
  );
  assert.equal(parts.at(-1)?.data.distanceMeters, 5000);
  assert.ok(parts.every((p) => JSON.stringify(p).length < 65000));
});
test('Unicode batches stay below gateway byte limit and replay ID is stable', async () => {
  const base = parseHealthTask(payload)[0];
  const split = await splitDetail({ ...base, data: { sensorTelemetry: '건강💚'.repeat(40000) } });
  const batches = ingestionBatches(split);
  for (const batch of batches)
    assert.ok(
      new TextEncoder().encode(
        JSON.stringify({ version: 1, batchId: 'web:' + 'x'.repeat(64), records: batch }),
      ).length < 2_000_000,
    );
  assert.equal(await importBatchId(batches[0]), await importBatchId(batches[0]));
  assert.deepEqual(
    JSON.parse(
      split
        .slice(0, -1)
        .map((p) => p.data.jsonPart)
        .join(''),
    ),
    { sensorTelemetry: '건강💚'.repeat(40000) },
  );
});
