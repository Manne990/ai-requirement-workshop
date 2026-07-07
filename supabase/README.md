# Supabase Production Boundary

This directory contains the first production schema foundation for AI Requirement Workshop.

## Included

- Organization, membership, organization invite, workshop, message, artifact, requirement, approval, prototype, attachment, audit, and read-state tables.
- Row Level Security enabled for every production table.
- Membership-based policies for organization and workshop isolation.
- Helper functions for organization/workshop membership and edit checks using owner, facilitator, participant, and viewer roles.
- Private `workshop-attachments` Supabase Storage bucket configuration with
  workshop-scoped object policies.
- Supabase Realtime publication entries for core collaboration tables.

## Not Yet Proven

- The migration has not been applied to a real Supabase project in this repository.
- RLS policies are text-verified in CI and migrations are applied to a
  disposable Postgres database by `npm run test:supabase:migrations`; they have
  not been executed against a real Supabase project yet.
- Storage bucket policies and realtime publication have executable migrations,
  but still need applied-environment evidence in a real Supabase project.

## Realtime Foundation

The application code includes a Supabase Realtime adapter boundary in
`src/persistence/realtimeWorkshopChannel.ts` and pure conflict handling in
`src/domain/collaboration.ts`. That foundation covers broadcast workshop events,
presence snapshots, local in-memory fallback for tests, and stale artifact-status
conflict detection. It does not require service-role keys or committed secrets.

## Workshop Snapshot Runtime

`src/persistence/supabaseWorkshopStore.ts` writes resumable workshop snapshots
through the browser Supabase client, protected by the membership-based RLS
policies in these migrations.

- Set `VITE_SUPABASE_ORGANIZATION_ID` only when the signed-in user already has
  an active membership in that organization. The adapter will fail early with a
  membership-specific error instead of creating a parallel personal
  organization.
- Without a configured organization id, the adapter reuses an existing active
  membership before creating a personal organization. Owner and facilitator
  memberships are preferred because workshop snapshot saves require write
  access.
- List, load, and save failures are wrapped with operation context so RLS,
  network, or malformed-row issues are diagnosable from the client error
  message.

## Verification

Current CI runs:

```bash
npm test -- server/supabaseSchema.test.ts
npm run test:supabase:migrations
npm run ci
```

Before production launch, run the environment-backed production probe against an
isolated Supabase project after applying these migrations:

```bash
npm run test:supabase:production
```

That probe creates temporary Supabase Auth users, profiles, one organization,
one workshop, messages, artifacts, requirements, audit events, attachment
metadata, and one Storage object. It verifies owner/facilitator/participant/
viewer/outsider behavior through real Supabase clients, then deletes the
temporary data unless `AI_REQUIREMENT_WORKSHOP_KEEP_PRODUCTION_VERIFY_DATA=1`
is set.
