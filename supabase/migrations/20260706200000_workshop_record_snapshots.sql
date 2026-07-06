-- Durable workshop-record snapshots used by the browser Supabase adapter.
-- The normalized workshop tables remain the long-term collaboration model; these
-- columns make the current V1 workshop state resumable across devices without a
-- custom backend.

alter table public.workshops
  add column if not exists record_key text,
  add column if not exists session_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists seen_insight_ids_by_participant jsonb not null default '{}'::jsonb;

create unique index if not exists workshops_org_record_key_idx
  on public.workshops(organization_id, record_key);

create policy memberships_creator_owner_bootstrap on public.memberships
  for insert with check (
    user_id = auth.uid()
    and role = 'owner'
    and exists (
      select 1
      from public.organizations
      where organizations.id = memberships.organization_id
        and organizations.created_by = auth.uid()
    )
  );
