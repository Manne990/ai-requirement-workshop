# Supabase Production Boundary

This directory contains the first production schema foundation for AI Requirement Workshop.

## Included

- Organization, membership, workshop, message, artifact, requirement, approval, prototype, attachment, audit, and read-state tables.
- Row Level Security enabled for every production table.
- Membership-based policies for organization and workshop isolation.
- Helper functions for organization/workshop membership and edit checks.

## Not Yet Proven

- The migration has not been applied to a real Supabase project in this repository.
- RLS policies are text-verified in CI, not database-executed yet.
- Storage bucket policies for attachment objects still need an applied Supabase environment.
- Realtime publication and conflict reconciliation are not configured yet.

## Verification

Current CI runs:

```bash
npm test -- server/supabaseSchema.test.ts
npm run ci
```

Before production launch, add an environment-backed migration test that applies this SQL to an isolated Supabase project or local Supabase database, then verifies tenant isolation with at least two users and two organizations.
