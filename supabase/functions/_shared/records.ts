export type HealthRecord = {
  source: string;
  externalId: string;
  kind: string;
  measuredAt: string;
  timezone?: string;
  data: Record<string, unknown>;
  updatedAt: string;
  deleted?: boolean;
};
export function validateRecords(records: unknown): asserts records is HealthRecord[] {
  if (!Array.isArray(records) || records.length > 250 || records.length === 0)
    throw new Error('Expected 1..250 records');
  for (const r of records) {
    if (
      !r ||
      !['health_task', 'health_connect', 'oura', 'apple_health'].includes(r.source) ||
      !['workout', 'measurement', 'daily_summary'].includes(r.kind) ||
      typeof r.externalId !== 'string' ||
      !r.externalId ||
      r.externalId.length > 500 ||
      !r.data ||
      Array.isArray(r.data) ||
      typeof r.data !== 'object' ||
      !iso(r.measuredAt) ||
      !iso(r.updatedAt) ||
      (r.deleted !== undefined && typeof r.deleted !== 'boolean')
    )
      throw new Error('Invalid record');
    if (r.timezone) {
      try {
        new Intl.DateTimeFormat('en', { timeZone: r.timezone });
      } catch {
        throw new Error('Invalid timezone');
      }
    }
  }
}
function iso(value: unknown) {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}
