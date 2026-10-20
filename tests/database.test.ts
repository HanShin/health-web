import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('PostgreSQL migration, pairing replay, ingestion rollback, stale updates and RLS', async () => {
  const db = new PGlite();
  try {
    // Minimal Supabase auth/roles fixture. No remote service or personal health data.
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
   create schema auth; create schema extensions;
   create table auth.users(id uuid primary key,email text);
   create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
   create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
   grant usage on schema auth,public to authenticated,anon;
   grant execute on function auth.jwt(),auth.uid() to authenticated,anon;
  `);
    for (const file of (await readdir('supabase/migrations'))
      .filter((f) => f.endsWith('.sql'))
      .sort()) {
      const sql = await readFile('supabase/migrations/' + file, 'utf8');
      // PGlite has core gen_random_uuid; pgcrypto deployment extension is unavailable in WASM.
      await db.exec(
        sql.replace(/create extension if not exists pgcrypto with schema extensions;/i, ''),
      );
    }
    await db.exec(await readFile('supabase/tests/security.sql', 'utf8'));
    const result = await db.query<{ count: number }>(
      'select count(*)::int as count from public.health_records',
    );
    assert.equal(result.rows[0].count, 0, 'security scenario rolls back all test data');
  } finally {
    await db.close();
  }
});
