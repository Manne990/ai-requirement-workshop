#!/usr/bin/env bash
set -euo pipefail

psql_bin="${PSQL:-psql}"
createdb_bin="${CREATEDB:-createdb}"
dropdb_bin="${DROPDB:-dropdb}"
db_name="${AI_REQUIREMENT_WORKSHOP_SUPABASE_VERIFY_DB:-ai_requirement_workshop_verify_$$}"

cleanup() {
  "$dropdb_bin" --if-exists "$db_name" >/dev/null 2>&1 || true
}

trap cleanup EXIT
cleanup
"$createdb_bin" "$db_name"

"$psql_bin" -v ON_ERROR_STOP=1 -d "$db_name" <<'SQL'
create schema if not exists auth;
create schema if not exists storage;
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'create role authenticated';
  end if;
end $$;
create table auth.users (
  id uuid primary key,
  email text
);
create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null references storage.buckets(id) on delete cascade,
  name text not null,
  owner uuid,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;
create publication supabase_realtime;
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
SQL

for migration in supabase/migrations/*.sql; do
  echo "Applying ${migration}"
  "$psql_bin" -v ON_ERROR_STOP=1 -d "$db_name" -f "$migration" >/dev/null
done

"$psql_bin" -v ON_ERROR_STOP=1 -d "$db_name" <<'SQL'
grant usage on schema public, storage to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select, insert, update, delete on all tables in schema storage to authenticated;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'owner@example.com'),
  ('00000000-0000-0000-0000-000000000002', 'participant@example.com'),
  ('00000000-0000-0000-0000-000000000003', 'viewer@example.com'),
  ('00000000-0000-0000-0000-000000000004', 'outsider@example.com');

insert into public.profiles (id, email, display_name) values
  ('00000000-0000-0000-0000-000000000001', 'owner@example.com', 'Owner'),
  ('00000000-0000-0000-0000-000000000002', 'participant@example.com', 'Participant'),
  ('00000000-0000-0000-0000-000000000003', 'viewer@example.com', 'Viewer'),
  ('00000000-0000-0000-0000-000000000004', 'outsider@example.com', 'Outsider');

insert into public.organizations (id, name, slug, created_by) values
  ('10000000-0000-0000-0000-000000000001', 'Verification Org', 'verification-org', '00000000-0000-0000-0000-000000000001');

insert into public.memberships (organization_id, user_id, role, status) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'participant', 'active'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'viewer', 'active');

insert into public.workshops (id, organization_id, title, status, created_by, record_key) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Verification Workshop', 'active', '00000000-0000-0000-0000-000000000001', 'verification-workshop');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
do $$
begin
  if not public.is_org_member('10000000-0000-0000-0000-000000000001') then
    raise exception 'owner should be organization member';
  end if;
  if not public.can_edit_workshop('20000000-0000-0000-0000-000000000001') then
    raise exception 'owner should edit workshop';
  end if;
  if not public.can_comment_workshop('20000000-0000-0000-0000-000000000001') then
    raise exception 'owner should comment workshop';
  end if;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
do $$
begin
  if not public.is_org_member('10000000-0000-0000-0000-000000000001') then
    raise exception 'participant should be organization member';
  end if;
  if public.can_edit_workshop('20000000-0000-0000-0000-000000000001') then
    raise exception 'participant should not edit workshop';
  end if;
  if not public.can_comment_workshop('20000000-0000-0000-0000-000000000001') then
    raise exception 'participant should comment workshop';
  end if;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
do $$
begin
  if not public.is_org_member('10000000-0000-0000-0000-000000000001') then
    raise exception 'viewer should be organization member';
  end if;
  if public.can_edit_workshop('20000000-0000-0000-0000-000000000001') then
    raise exception 'viewer should not edit workshop';
  end if;
  if public.can_comment_workshop('20000000-0000-0000-0000-000000000001') then
    raise exception 'viewer should not comment workshop';
  end if;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', false);
do $$
begin
  if public.is_org_member('10000000-0000-0000-0000-000000000001') then
    raise exception 'outsider should not be organization member';
  end if;
  if public.can_edit_workshop('20000000-0000-0000-0000-000000000001') then
    raise exception 'outsider should not edit workshop';
  end if;
  if public.can_comment_workshop('20000000-0000-0000-0000-000000000001') then
    raise exception 'outsider should not comment workshop';
  end if;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
insert into storage.objects (bucket_id, name, owner)
values (
  'workshop-attachments',
  'organizations/10000000-0000-0000-0000-000000000001/workshops/20000000-0000-0000-0000-000000000001/attachments/30000000-0000-0000-0000-000000000001/evidence.txt',
  '00000000-0000-0000-0000-000000000001'
);

set role authenticated;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
do $$
begin
  if not exists (
    select 1
    from storage.objects
    where bucket_id = 'workshop-attachments'
  ) then
    raise exception 'participant should see workshop attachment object metadata';
  end if;

  begin
    insert into storage.objects (bucket_id, name, owner)
    values (
      'workshop-attachments',
      'organizations/10000000-0000-0000-0000-000000000001/workshops/20000000-0000-0000-0000-000000000001/attachments/30000000-0000-0000-0000-000000000002/participant.txt',
      '00000000-0000-0000-0000-000000000002'
    );
    raise exception 'participant should not insert attachment objects';
  exception
    when insufficient_privilege then
      null;
  end;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
do $$
begin
  if not exists (
    select 1
    from storage.objects
    where bucket_id = 'workshop-attachments'
  ) then
    raise exception 'viewer should be able to see workshop attachment object metadata';
  end if;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', false);
do $$
begin
  if exists (
    select 1
    from storage.objects
    where bucket_id = 'workshop-attachments'
  ) then
    raise exception 'outsider should not see workshop attachment object metadata';
  end if;
end $$;

reset role;

do $$
begin
  if not exists (
    select 1
    from storage.buckets
    where id = 'workshop-attachments'
      and public = false
      and file_size_limit = 10485760
  ) then
    raise exception 'workshop attachment bucket should be private and size-limited';
  end if;

  if (
    select count(*)
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename in (
        'workshops',
        'messages',
        'artifacts',
        'requirements',
        'approvals',
        'read_states'
      )
  ) <> 6 then
    raise exception 'supabase_realtime publication should include collaboration tables';
  end if;
end $$;
SQL

echo "Supabase migration verification passed for ${db_name}"
