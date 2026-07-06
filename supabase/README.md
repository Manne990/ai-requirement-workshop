# Supabase Production Boundary

This directory contains the first production schema foundation for AI Requirement Workshop.

## Included

- Organization, membership, organization invite, workshop, message, artifact, requirement, approval, prototype, attachment, audit, and read-state tables.
- Row Level Security enabled for every production table.
- Membership-based policies for organization and workshop isolation.
- Helper functions for organization/workshop membership and edit checks using owner, facilitator, participant, and viewer roles.

## Not Yet Proven

- The migration has not been applied to a real Supabase project in this repository.
- RLS policies are text-verified in CI, not database-executed yet.
- Storage bucket policies for attachment objects still need an applied Supabase environment.
- Realtime publication is not configured in the database migration yet.

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
npm run ci
```

Before production launch, add an environment-backed migration test that applies this SQL to an isolated Supabase project or local Supabase database, then verifies tenant isolation with at least two users and two organizations.
