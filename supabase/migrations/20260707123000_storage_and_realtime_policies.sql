-- Attachment storage and realtime publication foundation.
-- This migration targets Supabase-managed projects, where the `storage` schema
-- and `supabase_realtime` publication already exist. The local migration
-- verifier creates minimal compatible stubs so these policies remain executable
-- evidence in CI.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'workshop-attachments',
  'workshop-attachments',
  false,
  10485760,
  array[
    'text/plain',
    'text/csv',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/png',
    'image/jpeg'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.workshop_attachment_storage_workshop_id(object_name text)
returns uuid
language plpgsql
stable
as $$
begin
  if split_part(object_name, '/', 1) <> 'organizations'
    or split_part(object_name, '/', 3) <> 'workshops'
    or split_part(object_name, '/', 5) <> 'attachments' then
    return null;
  end if;

  return split_part(object_name, '/', 4)::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

create or replace function public.workshop_attachment_storage_org_id(object_name text)
returns uuid
language plpgsql
stable
as $$
begin
  if split_part(object_name, '/', 1) <> 'organizations' then
    return null;
  end if;

  return split_part(object_name, '/', 2)::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

drop policy if exists workshop_attachment_objects_select on storage.objects;
drop policy if exists workshop_attachment_objects_insert on storage.objects;
drop policy if exists workshop_attachment_objects_update on storage.objects;
drop policy if exists workshop_attachment_objects_delete on storage.objects;

create policy workshop_attachment_objects_select on storage.objects
  for select using (
    bucket_id = 'workshop-attachments'
    and public.is_workshop_member(
      public.workshop_attachment_storage_workshop_id(name)
    )
  );

create policy workshop_attachment_objects_insert on storage.objects
  for insert with check (
    bucket_id = 'workshop-attachments'
    and public.can_edit_workshop(
      public.workshop_attachment_storage_workshop_id(name)
    )
    and public.is_org_member(public.workshop_attachment_storage_org_id(name))
  );

create policy workshop_attachment_objects_update on storage.objects
  for update using (
    bucket_id = 'workshop-attachments'
    and public.can_edit_workshop(
      public.workshop_attachment_storage_workshop_id(name)
    )
  ) with check (
    bucket_id = 'workshop-attachments'
    and public.can_edit_workshop(
      public.workshop_attachment_storage_workshop_id(name)
    )
    and public.is_org_member(public.workshop_attachment_storage_org_id(name))
  );

create policy workshop_attachment_objects_delete on storage.objects
  for delete using (
    bucket_id = 'workshop-attachments'
    and public.can_edit_workshop(
      public.workshop_attachment_storage_workshop_id(name)
    )
  );

do $$
declare
  realtime_table text;
  realtime_schema text;
  realtime_name text;
begin
  foreach realtime_table in array array[
    'workshops',
    'messages',
    'artifacts',
    'requirements',
    'approvals',
    'read_states'
  ]
  loop
    realtime_schema := 'public';
    realtime_name := realtime_table;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = realtime_schema
        and tablename = realtime_name
    ) then
      execute format(
        'alter publication supabase_realtime add table %I.%I',
        realtime_schema,
        realtime_name
      );
    end if;
  end loop;
end $$;
