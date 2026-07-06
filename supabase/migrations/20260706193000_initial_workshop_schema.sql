-- AI Requirement Workshop production schema foundation.
-- This migration is designed for Supabase Postgres with RLS enabled from the
-- first production slice. It intentionally avoids service-role assumptions in
-- browser-visible paths.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type public.organization_role as enum (
  'owner',
  'facilitator',
  'participant',
  'viewer'
);

create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.organization_role not null default 'participant',
  status text not null default 'active' check (status in ('active', 'suspended', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create type public.organization_invite_status as enum (
  'pending',
  'accepted',
  'revoked',
  'expired'
);

create table if not exists public.organization_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  token_hash text not null unique,
  role public.organization_role not null default 'participant',
  status public.organization_invite_status not null default 'pending',
  invited_by_user_id uuid not null references public.profiles(id),
  expires_at timestamptz not null,
  accepted_by_user_id uuid references public.profiles(id),
  accepted_at timestamptz,
  revoked_by_user_id uuid references public.profiles(id),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type public.workshop_status as enum (
  'draft',
  'active',
  'review',
  'completed',
  'archived'
);

create table if not exists public.workshops (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  status public.workshop_status not null default 'draft',
  local_import_id text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type public.workshop_participant_type as enum (
  'human',
  'facilitator',
  'agent'
);

create table if not exists public.workshop_participants (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  participant_key text not null,
  participant_type public.workshop_participant_type not null,
  display_name text not null,
  current_activity text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workshop_id, participant_key)
);

create type public.message_kind as enum (
  'welcome',
  'human-input',
  'facilitator-guidance',
  'agent-suggestion',
  'system'
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  participant_id uuid references public.workshop_participants(id) on delete set null,
  kind public.message_kind not null,
  body text not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create type public.artifact_type as enum (
  'source',
  'problem',
  'goal',
  'actor',
  'flow-step',
  'requirement',
  'risk',
  'assumption',
  'question',
  'decision'
);

create type public.artifact_status as enum (
  'draft',
  'accepted',
  'parked',
  'rejected'
);

create table if not exists public.artifacts (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  source_message_id uuid references public.messages(id) on delete set null,
  type public.artifact_type not null,
  title text not null,
  content text not null,
  status public.artifact_status not null default 'draft',
  created_by_participant_id uuid references public.workshop_participants(id) on delete set null,
  created_by_user_id uuid references public.profiles(id),
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.artifact_links (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  source_artifact_id uuid not null references public.artifacts(id) on delete cascade,
  target_artifact_id uuid not null references public.artifacts(id) on delete cascade,
  label text not null,
  created_at timestamptz not null default now(),
  unique (source_artifact_id, target_artifact_id, label)
);

create table if not exists public.requirements (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  source_artifact_id uuid references public.artifacts(id) on delete set null,
  title text not null,
  statement text not null,
  acceptance_criteria text[] not null default '{}',
  status public.artifact_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type public.approval_target_type as enum (
  'requirement',
  'decision',
  'report',
  'prototype'
);

create type public.approval_state as enum (
  'requested',
  'approved',
  'rejected',
  'changes_requested'
);

create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  target_type public.approval_target_type not null,
  target_id uuid not null,
  state public.approval_state not null default 'requested',
  decided_by uuid references public.profiles(id),
  decided_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.prototypes (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  title text not null,
  description text not null,
  html text,
  status public.artifact_status not null default 'draft',
  source_requirement_ids uuid[] not null default '{}',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type public.attachment_status as enum (
  'uploaded',
  'extracted',
  'rejected',
  'deleted'
);

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  source_message_id uuid references public.messages(id) on delete set null,
  file_name text not null,
  content_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  sha256 text not null,
  storage_path text not null,
  status public.attachment_status not null default 'uploaded',
  extracted_text text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  workshop_id uuid references public.workshops(id) on delete cascade,
  actor_user_id uuid references public.profiles(id),
  event_type text not null,
  target_table text,
  target_id uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.read_states (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  participant_key text not null,
  seen_artifact_ids uuid[] not null default '{}',
  updated_at timestamptz not null default now(),
  unique (workshop_id, user_id, participant_key)
);

create index if not exists memberships_user_idx on public.memberships(user_id);
create index if not exists organization_invites_org_idx on public.organization_invites(organization_id, status);
create unique index if not exists organization_invites_pending_email_idx
  on public.organization_invites(organization_id, email)
  where status = 'pending';
create index if not exists workshops_org_idx on public.workshops(organization_id);
create index if not exists messages_workshop_idx on public.messages(workshop_id, created_at);
create index if not exists artifacts_workshop_idx on public.artifacts(workshop_id, updated_at);
create index if not exists audit_events_workshop_idx on public.audit_events(workshop_id, created_at);

create or replace function public.is_org_member(target_org_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.memberships
    where organization_id = target_org_id
      and user_id = auth.uid()
      and status = 'active'
  );
$$;

create or replace function public.can_edit_org(target_org_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.memberships
    where organization_id = target_org_id
      and user_id = auth.uid()
      and status = 'active'
      and role in ('owner', 'facilitator')
  );
$$;

create or replace function public.can_manage_org(target_org_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.memberships
    where organization_id = target_org_id
      and user_id = auth.uid()
      and status = 'active'
      and role = 'owner'
  );
$$;

create or replace function public.is_workshop_member(target_workshop_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.workshops w
    join public.memberships m on m.organization_id = w.organization_id
    where w.id = target_workshop_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

create or replace function public.can_edit_workshop(target_workshop_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.workshops w
    join public.memberships m on m.organization_id = w.organization_id
    where w.id = target_workshop_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role in ('owner', 'facilitator', 'participant')
  );
$$;

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.organization_invites enable row level security;
alter table public.workshops enable row level security;
alter table public.workshop_participants enable row level security;
alter table public.messages enable row level security;
alter table public.artifacts enable row level security;
alter table public.artifact_links enable row level security;
alter table public.requirements enable row level security;
alter table public.approvals enable row level security;
alter table public.prototypes enable row level security;
alter table public.attachments enable row level security;
alter table public.audit_events enable row level security;
alter table public.read_states enable row level security;

create policy profiles_own_select on public.profiles
  for select using (id = auth.uid());
create policy profiles_own_insert on public.profiles
  for insert with check (id = auth.uid());
create policy profiles_own_update on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy organizations_member_select on public.organizations
  for select using (public.is_org_member(id));
create policy organizations_creator_insert on public.organizations
  for insert with check (created_by = auth.uid());
create policy organizations_owner_update on public.organizations
  for update using (public.can_manage_org(id)) with check (public.can_manage_org(id));

create policy memberships_member_select on public.memberships
  for select using (public.is_org_member(organization_id));
create policy memberships_owner_write on public.memberships
  for all using (public.can_manage_org(organization_id)) with check (public.can_manage_org(organization_id));

create policy organization_invites_member_select on public.organization_invites
  for select using (public.is_org_member(organization_id));
create policy organization_invites_facilitator_write on public.organization_invites
  for all using (public.can_edit_org(organization_id)) with check (public.can_edit_org(organization_id));

create policy workshops_member_select on public.workshops
  for select using (public.is_org_member(organization_id));
create policy workshops_editor_write on public.workshops
  for all using (public.can_edit_org(organization_id)) with check (public.can_edit_org(organization_id));

create policy workshop_participants_member_select on public.workshop_participants
  for select using (public.is_workshop_member(workshop_id));
create policy workshop_participants_editor_write on public.workshop_participants
  for all using (public.can_edit_workshop(workshop_id)) with check (public.can_edit_workshop(workshop_id));

create policy messages_member_select on public.messages
  for select using (public.is_workshop_member(workshop_id));
create policy messages_editor_insert on public.messages
  for insert with check (public.can_edit_workshop(workshop_id));

create policy artifacts_member_select on public.artifacts
  for select using (public.is_workshop_member(workshop_id));
create policy artifacts_editor_write on public.artifacts
  for all using (public.can_edit_workshop(workshop_id)) with check (public.can_edit_workshop(workshop_id));

create policy artifact_links_member_select on public.artifact_links
  for select using (public.is_workshop_member(workshop_id));
create policy artifact_links_editor_write on public.artifact_links
  for all using (public.can_edit_workshop(workshop_id)) with check (public.can_edit_workshop(workshop_id));

create policy requirements_member_select on public.requirements
  for select using (public.is_workshop_member(workshop_id));
create policy requirements_editor_write on public.requirements
  for all using (public.can_edit_workshop(workshop_id)) with check (public.can_edit_workshop(workshop_id));

create policy approvals_member_select on public.approvals
  for select using (public.is_workshop_member(workshop_id));
create policy approvals_editor_write on public.approvals
  for all using (public.can_edit_workshop(workshop_id)) with check (public.can_edit_workshop(workshop_id));

create policy prototypes_member_select on public.prototypes
  for select using (public.is_workshop_member(workshop_id));
create policy prototypes_editor_write on public.prototypes
  for all using (public.can_edit_workshop(workshop_id)) with check (public.can_edit_workshop(workshop_id));

create policy attachments_member_select on public.attachments
  for select using (public.is_workshop_member(workshop_id));
create policy attachments_editor_write on public.attachments
  for all using (public.can_edit_workshop(workshop_id)) with check (public.can_edit_workshop(workshop_id));

create policy audit_events_member_select on public.audit_events
  for select using (
    workshop_id is null
    or public.is_workshop_member(workshop_id)
    or (organization_id is not null and public.is_org_member(organization_id))
  );
create policy audit_events_editor_insert on public.audit_events
  for insert with check (
    actor_user_id = auth.uid()
    and (
      workshop_id is null
      or public.can_edit_workshop(workshop_id)
      or (organization_id is not null and public.can_edit_org(organization_id))
    )
  );

create policy read_states_own_select on public.read_states
  for select using (user_id = auth.uid() and public.is_workshop_member(workshop_id));
create policy read_states_own_write on public.read_states
  for all using (user_id = auth.uid() and public.is_workshop_member(workshop_id))
  with check (user_id = auth.uid() and public.is_workshop_member(workshop_id));
