export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export function errorStatus(error: unknown): number {
  if (error instanceof HttpError) return error.status;
  const m = error instanceof Error ? error.message : '';
  if (m === 'Unauthorized') return 401;
  if (m === 'Forbidden' || m === 'Account not allowed') return 403;
  if (m === 'Sync already running') return 409;
  if (m === 'Request too large') return 413;
  if (
    [
      'Invalid batch',
      'Invalid record',
      'Invalid timezone',
      'Expected 1..250 records',
      'Invalid claim',
      'Unknown action',
      'Invalid or expired code',
      'Invalid OAuth state',
      'OAuth denied',
      'Oura not connected',
    ].includes(m)
  )
    return 400;
  if (m === 'Oura permission revoked') return 403;
  if (m === 'Oura temporarily unavailable') return 503;
  if (m.startsWith('Oura ') || m === 'Invalid Oura token response') return 502;
  return 500;
}
