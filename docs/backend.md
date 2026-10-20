# Supabase backend

Project: `mwwrnhhbippprmidgaus` (`hanshin-workout`). On 2026-10-20 (Asia/Seoul), the owner chose to reuse this project instead of `hykgvrbsvldrjdoxxlnl`. The paused project was resumed. After restoration completed, the existing `health_cloud_backups` table was found; the new application schema was added without deleting it. All 10 health-web tables have RLS, and the existing backup table also has RLS. The owner's email allowlist is configured. Public signup and anonymous sign-in are disabled; email confirmation remains enabled.

Deployed all four Edge functions from the repository source. Internal imports were bundled with esbuild for the Dashboard editor; generated bundles are ignored under `.supabase-deploy/`. The owner explicitly approved disabling legacy gateway JWT verification on these four functions because their handlers authenticate users, device bearer tokens, OAuth state or the cron secret. `WEB_ORIGIN` is `https://health-web-rose.vercel.app`; `OURA_REDIRECT_URI` points to this project's `oura-connect` function. The owner created an Oura application in the new developer portal with Daily and Heartrate scopes and saved the client credentials, encryption key and cron secret in Edge Secrets. Matching project URL and cron authentication are in Vault. The `health-oura-hourly` schedule is active at `15 * * * *`. Both a direct cron-authenticated request and the database's Vault → pg_net → Edge path returned 200 with no connected accounts before consent. Embedded Oura login encountered `ERR_NETWORK_CHANGED`; the website now exposes an authorization link and copy action so login can continue in an external browser.

The owner completed Oura consent in Firefox on 2026-10-20. The signed-in web settings showed Oura connected and the initial sync completed with one record. A subsequent cron-authenticated sync returned HTTP 200 for one connected account with no failures; the web sync history also showed completion. This verifies initial and incremental collection without inspecting health values. The hourly job is configured and its HTTP transport was exercised; an automatically timed run has not yet been observed. A browser without the website's session returns to web login after consent, while an existing signed-in browser can reload settings to see the successful connection.

Live checks passed: the project public key is accepted; anonymous `health_records` and `allowed_emails` queries return no rows; unauthenticated ingestion returns 401; malformed pairing claims return 400. The owner accepted the account invitation, the Korean Magic Link / OTP template was saved with `{{ .Token }}`, and the owner completed OTP login on the deployed website. The authenticated dashboard and connections page read actual empty records without database errors. Authenticated device-pair code creation also succeeded; claiming on a real Android device and uploading health records still need device verification. This project currently uses Supabase's default email sender; custom SMTP is not configured. Previous SMTP configuration on the old project was not transferred.

Vercel: [production website](https://health-web-rose.vercel.app), [project](https://vercel.com/hanshin-7638s-projects/health-web). The GitHub repository is connected. All four web environment variables are configured for **Production only**; preview deployments do not receive the production database connection. A production redeploy with these variables succeeded. The local `.env.local` contains the same project URL, public key and owner allowlist, with a local app URL; it is ignored by Git.

The initial migration was applied through the Dashboard; Supabase CLI migration history was not initialized. Before any future db push, verify the applied schema and run `supabase migration repair 202610200001 --status applied` against the correctly linked project. Do not replay the table-creation migration.

## Setup

1. Install Supabase CLI and Deno. Run `supabase start` for a disposable local database. Run `supabase db reset` locally, never on the remote production database.
2. For a fresh environment, inspect existing remote schemas, link with `supabase link --project-ref mwwrnhhbippprmidgaus`, then apply reviewed migrations using `supabase db push`. For this already-configured project, repair the initial migration history as described above before pushing any later migration.
3. Insert the owner's lower-case email into `public.allowed_emails` via SQL Editor. This table is inaccessible to browser users. RLS and every Edge user/device authorization check enforce this list. Supabase Auth may still send an OTP to an unlisted address; it grants no health-data access. Disable public signup / configure an Auth hook if preventing such email delivery is also required.
4. For custom mail delivery, use Authentication → Emails → SMTP Settings. The Korean Magic Link / OTP template is already saved with {{ .Token }}. Configure custom SMTP before wider use to avoid the default sender's delivery and rate restrictions. Email confirmation stays enabled; invite the owner through the admin flow and accept the invitation before requesting OTP because public signup is disabled. Site URL is https://health-web-rose.vercel.app. Use only the project URL and publishable/anon key in public clients. SMTP passwords belong only in the Dashboard, never in the repository or public environment variables.
5. Configure Edge secrets: `WEB_ORIGIN` (exact web origin without trailing slash), `OURA_CLIENT_ID`, `OURA_CLIENT_SECRET`, `OURA_REDIRECT_URI` (`https://mwwrnhhbippprmidgaus.supabase.co/functions/v1/oura-connect`), `OURA_ENCRYPTION_KEY` (base64 of 32 cryptographically random bytes), and `CRON_SECRET` (random 256-bit value). Platform supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Keep the encryption key stable and backed up; rotation requires re-encrypting tokens or reconnecting Oura.
6. Deploy `health-ingest`, `device-pair`, `oura-connect`, and `oura-sync` with `supabase functions deploy`. Their gateway JWT verification is disabled deliberately: handlers verify Supabase JWTs through Auth, device bearer hashes, single-use OAuth state, or cron secrets themselves.
7. Register the app at https://developer.ouraring.com/applications (the legacy portal no longer creates new apps). Website is https://health-web-rose.vercel.app, privacy policy is /privacy and service terms are /terms. Select only Daily and Heartrate in the registration form; the owner completes contact details, the API agreement and app creation. Register the exact Oura redirect URI. Authorization requests only `daily heartrate`; daily endpoints supply scores, activity, sleep details, resting HR and HRV. Initial sync starts automatically after consent and covers one year; subsequent sync overlaps three days to catch revisions. Manual refresh is available for retries.
8. Create the two Vault secrets described in `supabase/schedule.sql`, then execute that script once. It invokes sync hourly at minute 15. Check `cron.job_run_details`, Edge logs and `connections.error_code`; HTTP scheduling success alone does not imply successful collection.

## Public contracts

All POST requests use JSON. Browser requests include `Authorization: Bearer <Supabase access token>` and `apikey: <public key>`. Device pairing claim needs no access token. All URLs are `${SUPABASE_URL}/functions/v1/<name>`. Errors return `{error:string}`: invalid input 400, auth 401/403, active sync lease 409, oversized body 413, internal/database/network failures 500, Oura upstream failures 502/503. Clients retain queued records and retry network/5xx errors with backoff; retry 409 later. Do not retry a rejected pairing code indefinitely. No endpoint accepts a caller-supplied user ID.

### `device-pair`

- `{action:"create"}` → `{code,expiresAt}`. Code is 32 lower-case hex characters, expires after ten minutes, and replaces previous codes for that user. Present it as copy/paste or QR, not a short numeric PIN.
- `{action:"claim",code,deviceName}` → `{deviceId,token}`. Atomic one-time consumption. `token` starts with `ht_`, is returned once, and belongs in Android Keystore-backed storage. Server stores SHA-256 only.
- `{action:"revoke",deviceId}` with user JWT → `{revoked:true}`. Immediately disables that owner's device token. Existing uploaded data remains.
- `{action:"revoke-self"}` with device bearer token → `{revoked:true}`. Android clears local credentials only after a successful response.

### `health-ingest`

User JWT or device bearer token. `{version:1,batchId:string,records:HealthRecord[]}` → `{accepted:number,batchId}`. 1–250 records, maximum 2,000,000 UTF-8 bytes. A repeated batch returns accepted=0. Persist a batch ID while retrying; use a new one after editing data. A single PostgreSQL transaction commits both all records and batch completion, or neither.

```ts
type HealthRecord = {
  source: 'health_task' | 'health_connect' | 'oura' | 'apple_health';
  externalId: string; // stable source ID, max 500 chars
  kind: 'workout' | 'measurement' | 'daily_summary';
  measuredAt: string; // ISO 8601 with offset
  timezone?: string; // IANA; default Asia/Seoul
  updatedAt: string; // source revision timestamp with offset
  data: Record<string, unknown>; // raw fields, unit, provenance, links, sensor data
  deleted?: boolean; // explicit tombstone; retain ID and required timestamps
};
```

Device credentials can upload only health_task/health_connect. Upserts use `(user_id,source,external_id)` and reject older source revisions; equal revisions permit replay. Tombstones retain source identity and revision time; queries exclude `deleted_at IS NOT NULL`. No absent-record inference is performed.

healthTask JSON import and Android share `source=health_task`: runningSessions use sessionId, bodyMeasurements use record.id, inBodyRecords use `inbody:<id>`. Preserve the entire analysis record in data, including `includedInSummary` / `duplicateOfSessionId`; never count excluded duplicate workouts. Large Android details use `externalId=<parent>:part:<sha256>:<index>`, data.recordType=`detail_part`, parentExternalId/contentHash/partIndex/partCount/jsonPart. Exclude these parts from summaries; reconstruct only a complete set matching the parent's hash metadata. The parent summary remains usable before all parts arrive.

### Oura

- `oura-connect` POST `{action:"authorize"}` → `{url}`. The web shows an explicit authorization link and a copy action; users can finish authentication in their preferred browser if embedded login fails. The link is valid for ten minutes. Navigate browser to URL. GET callback consumes state once, exchanges code, encrypts tokens using AES-256-GCM, starts initial sync using hosted `EdgeRuntime.waitUntil`, then redirects to `/connections?oura=connected`. Denied consent consumes the state and redirects with `oura=denied`. Sync completion/failure is recorded separately in sync_runs. Configure `[edge_runtime] policy="per_worker"` when testing background tasks locally; hosted runtime still enforces worker time limits, with cron retrying incomplete syncs.
- `oura-connect` POST `{action:"disconnect"}` removes local credentials; previously imported records remain. User can revoke the app in Oura account settings as well.
- `oura-sync` POST `{}` → `{accepted:number}`. Authenticated account only. Cron instead supplies `x-cron-secret`. Database leases prevent concurrent refresh of Oura's single-use refresh token. Retries include up to three attempts for rate limits and upstream 5xx. Token refresh failure requires reconnection; sync errors are retried next hour.

## Read model and security

Browser SELECT access only: `health_records`, `connections`, `sync_runs`, `devices`. Every policy requires matching `auth.uid()` and allowlisted email. Credentials, pair codes and OAuth state live in a private schema with no client grants. Browser mutations happen only through authenticated functions. `data` preserves raw values rather than coercing missing data to zero. Providers remain separate; there is no cross-provider summation.

## Verification

2026-10-20 local checks passed: TypeScript, ESLint, all 8 web/database tests, all 16 Deno tests, and Deno checks for all four Edge entrypoints. A local production build passed with `pnpm build --webpack`; the default local Turbopack build hit this sandbox's process/port restriction. The normal `pnpm build` succeeded on Vercel.

- `pnpm test:edge` runs 16 Deno tests for validation, retryable HTTP errors, and mocked Oura requests/rate limits/refresh failures. All 16 passed in Deno 2.9.6.
- `pnpm check:edge` checks all four Edge entrypoints. All passed in Deno 2.9.6.
- `pnpm test` executes the migration and `security.sql` successfully in PGlite PostgreSQL with a minimal Supabase auth/role fixture. Only the unavailable pgcrypto extension declaration is skipped; core gen_random_uuid is used. This covers transactions/RLS, code replay, OAuth state replay and refresh leases but does not emulate Auth HTTP or the hosted gateway.
- Run `supabase/tests/security.sql` with psql against a disposable local database after migrations. It tests code replay, idempotent ingestion, stale revisions/tombstones, malformed-batch rollback, denied anonymous RPC execution, cross-user RLS and token revocation in a rolled-back transaction.
- Before production: exercise an allowed and denied email, unauthorized ingest, device reconnect, offline replay, tombstone update, malformed batch rollback, Oura consent denial/token expiry/rate limit and real Health Connect permissions. Those need local services or actual credentials and are not claimed verified by source-only checks.

References: [Supabase Auth in Edge Functions](https://supabase.com/docs/guides/functions/auth-legacy-jwt), [scheduling functions](https://supabase.com/docs/guides/functions/schedule-functions), [Oura authentication](https://cloud.ouraring.com/docs/authentication).
