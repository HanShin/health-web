import { validateRecords } from './records.ts';
const record = {
  source: 'health_task',
  externalId: 'run:1',
  kind: 'workout',
  measuredAt: '2026-10-20T01:00:00Z',
  updatedAt: '2026-10-20T02:00:00Z',
  data: { distanceMeters: 1000 },
};
Deno.test('accepts complete records and explicit deletion tombstones', () => {
  validateRecords([record, { ...record, deleted: true, data: {} }]);
});
for (const [name, records] of Object.entries({
  empty: [],
  source: [{ ...record, source: 'other' }],
  date: [{ ...record, measuredAt: 'bad' }],
  timezone: [{ ...record, timezone: 'bad/zone' }],
  payload: [{ ...record, data: null }],
  oversized: Array(251).fill(record),
})) {
  Deno.test(`rejects ${name}`, () => {
    let failed = false;
    try {
      validateRecords(records);
    } catch {
      failed = true;
    }
    if (!failed) throw new Error('Expected rejection');
  });
}
