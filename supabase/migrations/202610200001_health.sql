-- Additive schema. Apply after inspecting the linked project's existing schema.
create extension if not exists pgcrypto with schema extensions;
create schema if not exists health_private;
revoke all on schema health_private from public, anon, authenticated;
create table public.allowed_emails (email text primary key check (email = lower(email)));
alter table public.allowed_emails enable row level security;
grant select on public.allowed_emails to service_role;
create function public.health_access() returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.allowed_emails where email = lower(auth.jwt()->>'email'));
$$;
create table public.connections (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 source text not null, status text not null default 'connected', last_synced_at timestamptz,
 error_code text, last_error text, updated_at timestamptz not null default now(), unique(user_id,source)
);
create table public.sync_runs (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 source text not null, batch_id text not null, status text not null, record_count integer not null default 0,
 created_at timestamptz not null default now(), started_at timestamptz not null default now(), finished_at timestamptz, error text, unique(user_id,source,batch_id)
);
create table public.health_records (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 source text not null check(source in ('health_task','health_connect','oura','apple_health')),
 external_id text not null, kind text not null check(kind in ('workout','measurement','daily_summary')),
 measured_at timestamptz not null, timezone text not null default 'Asia/Seoul', data jsonb not null,
 source_updated_at timestamptz not null, deleted_at timestamptz, updated_at timestamptz not null default now(),
 unique(user_id,source,external_id)
);
create index on public.health_records(user_id,measured_at desc);
create table public.devices (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 name text not null, created_at timestamptz not null default now(), last_seen_at timestamptz, revoked_at timestamptz
);
create table health_private.device_tokens(device_id uuid primary key references public.devices on delete cascade, token_hash text unique not null);
create table health_private.pair_codes(code_hash text primary key,user_id uuid not null references auth.users on delete cascade,expires_at timestamptz not null);
create table health_private.oauth_states(state_hash text primary key,user_id uuid not null references auth.users on delete cascade,expires_at timestamptz not null);
create table health_private.oura_tokens(user_id uuid primary key references auth.users on delete cascade,ciphertext text not null,expires_at timestamptz not null);
create table health_private.sync_leases(user_id uuid primary key references auth.users on delete cascade,lease_id uuid not null,expires_at timestamptz not null);
-- Private schema grants are already revoked; RLS is an additional safeguard.
alter table health_private.device_tokens enable row level security;
alter table health_private.pair_codes enable row level security;
alter table health_private.oauth_states enable row level security;
alter table health_private.oura_tokens enable row level security;
alter table health_private.sync_leases enable row level security;
do $$ declare t text; begin foreach t in array array['connections','sync_runs','health_records','devices'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy owner_read on public.%I for select to authenticated using (user_id = auth.uid() and public.health_access())',t);
 execute format('grant select on public.%I to authenticated',t);
end loop; end; $$;
-- All mutations are service-only RPCs. No client can select hashes or OAuth tokens.
create function public.health_pair_create(p_user uuid,p_hash text) returns void language sql security definer set search_path='' as $$
 delete from health_private.pair_codes where user_id=p_user or expires_at < now();
 insert into health_private.pair_codes values(p_hash,p_user,now()+interval '10 minutes');
$$;
create function public.health_pair_claim(p_hash text,p_token_hash text,p_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid; d uuid; begin
 delete from health_private.pair_codes where code_hash=p_hash and expires_at>now() returning user_id into u;
 if u is null then raise exception 'Invalid or expired code'; end if;
 if not exists(select 1 from public.allowed_emails a join auth.users b on lower(b.email)=a.email where b.id=u) then raise exception 'Account not allowed'; end if;
 insert into public.devices(user_id,name) values(u,left(p_name,100)) returning id into d;
 insert into health_private.device_tokens values(d,p_token_hash); return d;
end; $$;
create function public.health_device_user(p_hash text) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid; begin
 select d.user_id into u from public.devices d join health_private.device_tokens t on t.device_id=d.id
 join auth.users account on account.id=d.user_id join public.allowed_emails a on a.email=lower(account.email)
 where t.token_hash=p_hash and d.revoked_at is null;
 if u is not null then update public.devices set last_seen_at=now() where id in(select device_id from health_private.device_tokens where token_hash=p_hash); end if;
 return u;
end;
$$;
create function public.health_revoke_device(p_user uuid,p_device uuid) returns void language sql security definer set search_path='' as $$
 update public.devices set revoked_at=now() where id=p_device and user_id=p_user;
 delete from health_private.device_tokens where device_id in(select id from public.devices where id=p_device and user_id=p_user);
$$;
create function public.health_revoke_self(p_hash text) returns void language sql security definer set search_path='' as $$
 update public.devices set revoked_at=now() where id in(select device_id from health_private.device_tokens where token_hash=p_hash);
 delete from health_private.device_tokens where token_hash=p_hash;
$$;
create function public.health_ingest(p_user uuid,p_batch text,p_records jsonb) returns integer language plpgsql security definer set search_path='' as $$
declare r jsonb; n integer:=0; begin
 if not exists(select 1 from auth.users u join public.allowed_emails a on a.email=lower(u.email) where u.id=p_user) then raise exception 'Account not allowed'; end if;
 if exists(select 1 from public.sync_runs where user_id=p_user and source='batch' and batch_id=p_batch and status='completed') then return 0; end if;
 insert into public.sync_runs(user_id,source,batch_id,status) values(p_user,'batch',p_batch,'running') on conflict(user_id,source,batch_id) do update set status='running',started_at=now(),finished_at=null,error=null where public.sync_runs.status='failed';
 if not found then return 0; end if;
 for r in select * from jsonb_array_elements(p_records) loop
 insert into public.health_records(user_id,source,external_id,kind,measured_at,timezone,data,source_updated_at,deleted_at)
 values(p_user,r->>'source',r->>'externalId',r->>'kind',(r->>'measuredAt')::timestamptz,coalesce(r->>'timezone','Asia/Seoul'),r->'data',(r->>'updatedAt')::timestamptz,case when (r->>'deleted')::boolean then now() end)
 on conflict(user_id,source,external_id) do update set kind=excluded.kind,measured_at=excluded.measured_at,timezone=excluded.timezone,data=excluded.data,source_updated_at=excluded.source_updated_at,deleted_at=excluded.deleted_at,updated_at=now()
 where public.health_records.source_updated_at<=excluded.source_updated_at;
 n:=n+1;
 end loop;
 insert into public.connections(user_id,source,status,last_synced_at)
 select distinct p_user,value->>'source','connected',now() from jsonb_array_elements(p_records) where value->>'source'<>'oura'
 on conflict(user_id,source) do update set status='connected',last_synced_at=now(),error_code=null,last_error=null;
 update public.sync_runs set status='completed',record_count=n,finished_at=now() where user_id=p_user and source='batch' and batch_id=p_batch;
 return n;
end; $$;
create function public.health_oauth_state(p_user uuid,p_hash text) returns void language sql security definer set search_path='' as $$
 delete from health_private.oauth_states where expires_at<now() or user_id=p_user;
 insert into health_private.oauth_states values(p_hash,p_user,now()+interval '10 minutes');
$$;
create function public.health_oura_lock(p_user uuid,p_lease uuid,p_release boolean default false) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_release then delete from health_private.sync_leases where user_id=p_user and lease_id=p_lease; return true; end if;
 insert into health_private.sync_leases values(p_user,p_lease,now()+interval '10 minutes') on conflict(user_id) do update set lease_id=excluded.lease_id,expires_at=excluded.expires_at where health_private.sync_leases.expires_at<now();
 return exists(select 1 from health_private.sync_leases where user_id=p_user and lease_id=p_lease);
end; $$;
create function public.health_oauth_claim(p_hash text) returns uuid language sql security definer set search_path='' as $$
 delete from health_private.oauth_states where state_hash=p_hash and expires_at>now() returning user_id;
$$;
create function public.health_oura_token(p_user uuid,p_cipher text default null,p_expiry timestamptz default null,p_delete boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$ begin
 if p_delete then delete from health_private.oura_tokens where user_id=p_user; return null; end if;
 if p_cipher is not null then insert into health_private.oura_tokens values(p_user,p_cipher,p_expiry) on conflict(user_id) do update set ciphertext=excluded.ciphertext,expires_at=excluded.expires_at; end if;
 return (select jsonb_build_object('ciphertext',ciphertext,'expiresAt',expires_at) from health_private.oura_tokens where user_id=p_user);
end; $$;
-- PostgreSQL grants EXECUTE to PUBLIC by default: explicitly close every privileged RPC.
do $$ declare f record; begin for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'health_%' and p.proname<>'health_access' loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 execute format('grant execute on function %s to service_role',f.signature);
end loop; end; $$;
grant usage on schema public,health_private to service_role;
grant all on all tables in schema health_private to service_role;
grant all on public.allowed_emails,public.connections,public.sync_runs,public.health_records,public.devices to service_role;
