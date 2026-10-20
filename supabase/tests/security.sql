-- Execute against a disposable LOCAL Supabase database only. Always rolls back.
begin;
insert into auth.users(id,email) values('11111111-1111-1111-1111-111111111111','owner@example.test'),('22222222-2222-2222-2222-222222222222','other@example.test');
insert into public.allowed_emails values('owner@example.test'),('other@example.test');
select public.health_pair_create('11111111-1111-1111-1111-111111111111','test-code-hash');
select public.health_pair_claim('test-code-hash','test-token-hash','Test device');
do $$ begin
 begin perform public.health_pair_claim('test-code-hash','other-token','Replay'); raise exception 'Code reuse was accepted';
 exception when others then if sqlerrm='Code reuse was accepted' then raise; end if; end;
 if public.health_device_user('test-token-hash') is distinct from '11111111-1111-1111-1111-111111111111'::uuid then raise exception 'Device identity failed';end if;
end; $$;
select public.health_ingest('11111111-1111-1111-1111-111111111111','batch-1','[{"source":"health_task","externalId":"run-1","kind":"workout","measuredAt":"2026-10-20T00:00:00Z","updatedAt":"2026-10-20T00:00:00Z","data":{"distanceMeters":1000}}]');
select public.health_ingest('11111111-1111-1111-1111-111111111111','batch-1','[{"source":"health_task","externalId":"run-1","kind":"workout","measuredAt":"2026-10-20T00:00:00Z","updatedAt":"2026-10-20T00:00:00Z","data":{"distanceMeters":9999}}]');
do $$ begin if (select count(*) from public.health_records)<>1 or (select data->>'distanceMeters' from public.health_records limit 1)<>'1000' then raise exception 'Batch replay changed data';end if;end; $$;
select public.health_ingest('11111111-1111-1111-1111-111111111111','batch-2','[{"source":"health_task","externalId":"run-1","kind":"workout","measuredAt":"2026-10-20T00:00:00Z","updatedAt":"2026-10-21T00:00:00Z","deleted":true,"data":{}}]');
select public.health_ingest('11111111-1111-1111-1111-111111111111','batch-old','[{"source":"health_task","externalId":"run-1","kind":"workout","measuredAt":"2026-10-20T00:00:00Z","updatedAt":"2026-10-19T00:00:00Z","data":{}}]');
do $$ begin
 if (select deleted_at from public.health_records limit 1) is null then raise exception 'Older update resurrected tombstone';end if;
 begin perform public.health_ingest('11111111-1111-1111-1111-111111111111','batch-invalid','[{"source":"health_task","externalId":"new","kind":"workout","measuredAt":"2026-10-20T00:00:00Z","updatedAt":"2026-10-20T00:00:00Z","data":{}},{"source":"invalid","externalId":"bad","kind":"workout","measuredAt":"2026-10-20T00:00:00Z","updatedAt":"2026-10-20T00:00:00Z","data":{}}]'); raise exception 'Malformed batch accepted';
 exception when check_violation then null; end;
 if exists(select 1 from public.health_records where external_id='new') or exists(select 1 from public.sync_runs where batch_id='batch-invalid') then raise exception 'Malformed batch partially committed';end if;
 if has_function_privilege('anon','public.health_ingest(uuid,text,jsonb)','EXECUTE') then raise exception 'Anon can invoke privileged RPC';end if;
end; $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","email":"other@example.test","role":"authenticated"}',true);
do $$ begin if exists(select 1 from public.health_records) then raise exception 'Cross-user read allowed';end if;end; $$;
reset role;
-- Own-user positive path and allowlist revocation are both required.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","email":"owner@example.test","role":"authenticated"}',true);
do $$ begin
 if (select count(*) from public.health_records)<>1 then raise exception 'Owner cannot read own records';end if;
 begin perform 1 from health_private.device_tokens; raise exception 'Private tokens exposed';
 exception when insufficient_privilege then null;end;
end; $$;
reset role;
delete from public.allowed_emails where email='owner@example.test';
set local role authenticated;
do $$ begin if exists(select 1 from public.health_records) then raise exception 'Removed allowlist still grants access';end if;end; $$;
reset role;
insert into public.allowed_emails values('owner@example.test');
-- OAuth states and refresh leases are one-use/exclusive.
select public.health_oauth_state('11111111-1111-1111-1111-111111111111','oauth-test');
do $$ begin
 if public.health_oauth_claim('oauth-test') is distinct from '11111111-1111-1111-1111-111111111111'::uuid then raise exception 'OAuth state claim failed';end if;
 if public.health_oauth_claim('oauth-test') is not null then raise exception 'OAuth state replay allowed';end if;
 if not public.health_oura_lock('11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') then raise exception 'Lease acquisition failed';end if;
 if public.health_oura_lock('11111111-1111-1111-1111-111111111111','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') then raise exception 'Concurrent lease allowed';end if;
 perform public.health_oura_lock('11111111-1111-1111-1111-111111111111','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',true);
 if public.health_oura_lock('11111111-1111-1111-1111-111111111111','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') then raise exception 'Wrong holder released lease';end if;
 perform public.health_oura_lock('11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',true);
 if not public.health_oura_lock('11111111-1111-1111-1111-111111111111','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') then raise exception 'Released lease unavailable';end if;
end; $$;
select public.health_revoke_device('11111111-1111-1111-1111-111111111111',id) from public.devices;
do $$ begin if public.health_device_user('test-token-hash') is not null then raise exception 'Revoked token accepted';end if;end; $$;
rollback;
