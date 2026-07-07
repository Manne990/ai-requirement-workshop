# Production Architecture

Issue: #20 PROD-01. Supporting context: #34 PROD-15.

This document defines the target production boundary for AI Requirement
Workshop. It does not implement authentication, database access, or production
API routes; it gives later implementation issues a concrete architecture to
build against.

## Goals

- Keep the browser as a React/Vite single-page app deployed on Vercel.
- Keep OpenAI/Codex and privileged Supabase secrets out of browser code.
- Use Supabase for authentication, relational workshop data, attachments, and
  realtime collaboration.
- Use a minimal Vercel backend-for-frontend (BFF) only where browser-only code
  would expose secrets, skip authorization checks, or need server-side audit
  control.
- Preserve the V4 local-first export/import path so existing local workshops can
  coexist with, or migrate into, production state.

## Non-Goals

- No auth code is added by this architecture slice.
- No Supabase schema, migration, RLS policy, or generated client is added here.
- No production deploy is performed by this architecture slice. The CI
  deployment gate is verification-only and does not require Vercel, Supabase, or
  OpenAI secrets.

## Target Topology

```text
Browser SPA on Vercel
  |-- public Supabase URL + anon key
  |-- user JWT from Supabase Auth
  |
  |-- Supabase client calls with RLS
  |     |-- Auth: identity and session lifecycle
  |     |-- Postgres: workshops, messages, artifacts, approvals, audit
  |     |-- Storage: attachment and prototype objects
  |     `-- Realtime: presence and workshop change fanout
  |
  `-- Vercel BFF routes
        |-- /api/codex/status
        |-- /api/codex/workshop-turn
        `-- future import/admin routes only when server authority is required
              |
              |-- OpenAI Responses API or Codex model endpoint
              `-- Supabase server client for audited privileged work
```

The production frontend should continue to render the workshop room, canvas,
chat, readiness panel, export/import controls, and participant state. Durable
shared state moves from browser storage to Supabase once a user signs in and
opens a server-backed workshop.

## Frontend Boundary

The browser may hold only public or user-scoped credentials:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- the current user's Supabase session/JWT

The browser must never receive:

- `OPENAI_API_KEY`
- `CODEX_API_TOKEN`
- `SUPABASE_SERVICE_ROLE_KEY`
- captured Authorization headers
- generated config that embeds production secrets

Frontend responsibilities:

- Render workshop state and local pending edits.
- Call Supabase directly for user-authorized data paths protected by RLS.
- Subscribe to Supabase Realtime for workshop changes and presence.
- Upload and download attachments through Supabase Storage with user-scoped
  policies or signed URLs.
- Call the BFF for Codex/OpenAI turns because AI tokens are server-only.
- Keep IndexedDB/localStorage as a local draft cache and migration bridge, not
  as the production source of truth for authenticated workshops.

## Minimal BFF Boundary

The Vercel BFF should stay small. It exists to protect secrets, enforce
server-side authorization, shape AI payloads, and write audit evidence for work
that should not be trusted to the browser alone.

Recommended production routes:

- `GET /api/codex/status`: returns model and configured status without exposing
  tokens.
- `POST /api/codex/workshop-turn`: accepts the latest workshop context, verifies
  the user's Supabase JWT, checks workshop membership, minimizes the prompt
  payload, calls the OpenAI Responses API, validates the JSON response, and
  writes an audit event.
- Future `POST /api/workshops/import`: optional server-side import path for V4
  export files when import requires deduplication, ownership assignment, or
  audit events that should not be client-only.

The current Vite plugin implements local development versions of
`/api/codex/status`, `/api/codex/workshop-turn`, and `/api/workshops/backup`.
The repository also includes Vercel-compatible production routes for the two
Codex endpoints under `api/codex/`; both local and production Codex paths share
the same server response validation module. The workshop-turn route writes
server-side Codex audit events as JSONL through an environment-scoped audit
sink; production still needs the same audit intent backed by authenticated
Supabase rows. `/api/workshops/backup` remains local-development-only disk
backup behavior and should not be exposed as a production persistence path.

## Supabase Boundary

### Auth

Supabase Auth owns:

- user identity
- session refresh
- passwordless or OAuth login policy
- JWT claims used by RLS

Application-specific authorization must be modeled in Postgres memberships, not
hard-coded in the frontend.

### Data

Supabase Postgres owns durable shared state. Every table that contains workshop
or organization data must have RLS enabled before production launch.

Required data domains:

- `profiles`: user display profile linked to Supabase Auth users.
- `organizations`: tenant or account boundary for workshop ownership.
- `memberships`: user role in an organization: owner, facilitator,
  participant, or viewer.
- `organization_invites`: pending, accepted, revoked, and expired organization
  invitations keyed by an application-generated token hash.
- `workshops`: title, lifecycle status, owning organization, created/updated
  metadata, and optional local V4 import source id.
- `workshop_participants`: invited humans and AI lens participants visible in a
  workshop.
- `messages`: human, facilitator, agent, and system messages.
- `artifacts`: canvas artifacts for sources, problems, goals, actors, flow
  steps, requirements, risks, assumptions, questions, and decisions.
- `artifact_links`: traceability edges between source material, artifacts,
  requirements, risks, and decisions.
- `requirements`: normalized requirement records promoted from accepted
  artifacts when downstream workflow needs stable requirement ids.
- `approvals`: approval workflow state for requirements, decisions, reports, and
  prototype signoff.
- `prototypes`: generated or linked prototype metadata, ownership, status, and
  relation to requirements.
- `attachments`: metadata for uploaded files, extraction status, security scan
  status, storage object path/status, source message id, uploader, checksum, and
  retention policy.
- `audit_events`: append-only evidence for security-sensitive and workflow
  events such as sign-in, membership changes, imports, AI turns, status changes,
  approvals, exports, and deletes.
- `read_states`: per-user or per-agent seen insight state currently represented
  locally as `seenInsightIdsByParticipant`.

RLS expectations:

- Organization members can see only their organization's workshops.
- Workshop access is derived from organization membership plus any future
  workshop-level invite table.
- Contributors can create messages and draft artifacts in workshops they can
  edit.
- Reviewers can approve or reject only records in workflows assigned to them.
- Audit events are append-only from application code and readable according to
  role.
- Service-role access is restricted to server code and never used in the
  browser.

### Storage

Supabase Storage owns durable binary objects:

- raw uploaded attachments
- generated report exports when product requirements call for server-retained
  exports
- generated or uploaded prototype assets

Storage object paths should include organization and workshop identifiers, for
example:

```text
organizations/{organization_id}/workshops/{workshop_id}/attachments/{attachment_id}/{file_name}
```

Attachment metadata belongs in Postgres. Storage policies must require the same
organization/workshop access as the related metadata row. Signed URLs should be
short-lived and generated only after an authorization check.

Attachment records must keep three states separate:

- extraction status: whether local parsing produced usable text or metadata only
- security scan status: accepted, needs review, or blocked
- storage status: active provider object, quarantined provider object, or
  metadata-only import/local record

Provider-backed attachments must use the canonical object path shown above and a
SHA-256 checksum. The path and checksum are part of provenance evidence and must
match the organization, workshop, attachment id, and sanitized file name before
the object can be referenced from metadata. Attachments that need manual review
may keep a quarantined provider object, but signed URLs and AI prompt use remain
blocked until review accepts the record. Imported or local-only attachments may
seed metadata and redacted source artifacts, but they must not claim a provider
object path unless the original file is uploaded and checksummed.

### Realtime

Supabase Realtime owns collaboration fanout:

- workshop presence
- message creation
- artifact creation and status updates
- selected workshop, selected artifact, visualization mode, and follow-mode
  metadata
- approval state changes
- readiness-affecting data changes

Realtime is not the authority for conflict resolution. Postgres writes and audit
events remain authoritative. Clients should treat Realtime as invalidation and
presence transport, then reconcile against current server rows.

The current codebase now has a foundation for this boundary without wiring it
into auth or the workshop UI:

- `src/domain/collaboration.ts` defines deterministic event ids, presence
  session events, per-artifact revisions, metadata revisions, provenance, and
  explicit conflict records.
- `src/persistence/realtimeWorkshopChannel.ts` defines the transport interface,
  a local in-memory channel for tests and anonymous/local fallback, and a narrow
  Supabase Realtime adapter for broadcast and presence.
- Concurrent artifact status changes require the sender's expected artifact
  revision. A stale update is retained as a conflict instead of silently
  replacing the current status.
- `server/workshopRecordsApi.ts` and `src/persistence/serverWorkshopStore.ts`
  use workshop-record revisions for the local server-backed store boundary. An
  update to an existing workshop must carry the last observed revision, and a
  stale or missing revision receives a conflict instead of overwriting state.
- The Supabase snapshot adapter mirrors the same contract with
  `workshops.record_revision`: it looks up the current row, rejects stale
  revisions before writing, and performs explicit insert/update operations
  rather than using blind snapshot upserts.

## Vercel Deployment Assumptions

- Vercel builds the SPA with `npm run build`.
- GitHub Actions remains the stronger verification gate with `npm run ci`.
- GitHub Actions also runs a deployment-readiness gate that validates the
  documented environment contract without contacting Vercel or Supabase.
- Production and Preview deployments use Vercel environment variables, not
  committed config.
- Vercel Functions host the BFF routes that need server-only secrets.
- Preview deployments should use a preview Supabase project or isolated schemas
  when testing migrations and RLS changes.
- Production deploys should not run until Supabase migrations, RLS policies, and
  storage policies have a repeatable migration path and test evidence.
- GitHub Actions has an optional `supabase-production` workflow-dispatch job
  that runs the destructive isolated Supabase probe when production/preview
  secrets are configured for the repository.
- The operational deployment runbook is `docs/deployment.md`.

## Environment Variables

Use `.env.example` as the non-secret template for local setup. Copy it to
`.env.local` for local development. `.env`, `.env.*`, and `.env.local` are
ignored by git; only `.env.example` should be committed.

Local V4 variables:

- `OPENAI_API_KEY`: local server-side token read by the Vite plugin.
- `CODEX_API_TOKEN`: optional local alias for the same local Codex/OpenAI
  boundary.
- `AI_REQUIREMENT_WORKSHOP_BACKUP_DIR`: optional local disk backup override for
  `/api/workshops/backup`.

Production public variables:

- `VITE_SUPABASE_URL`: browser-safe Supabase project URL.
- `VITE_SUPABASE_ANON_KEY`: browser-safe Supabase anon key, protected by RLS.
- `VITE_SUPABASE_ORGANIZATION_ID`: optional browser-safe organization selector
  for controlled environments. Omit it when the app should create or select the
  user's organization through the normal membership flow.
- `VITE_MISSION_CONTROL_TELEMETRY_ENDPOINT`: optional browser-safe endpoint for
  redacted Mission Control telemetry events.

Production server-only variables:

- `OPENAI_API_KEY` or `CODEX_API_TOKEN`: Vercel Function secret for AI calls.
- `SUPABASE_SERVICE_ROLE_KEY`: Vercel Function secret for rare privileged
  server tasks. Prefer user JWT plus RLS for normal BFF requests.

Do not add `VITE_` to any secret. Vite exposes `VITE_` variables to browser
code.

## Local, Preview, and Production Modes

Local development:

- Run `npm install` and `npm run dev`.
- Use `.env.local` for local OpenAI/Codex tokens.
- Use browser storage plus optional disk backup mirror.
- Use Supabase local development or a disposable Supabase project only when a
  future implementation issue introduces Supabase code.

Preview deployment:

- Vercel builds each branch or pull request.
- Use preview-scoped Supabase config and AI tokens.
- Treat preview data as disposable.
- Run `npm run ci` before handing off or requesting review.

Production deployment:

- Vercel hosts the frontend and BFF functions.
- Supabase production project owns auth, database, storage, and realtime.
- Production secrets live only in Vercel and Supabase secret managers.
- Database migrations and RLS changes require verification evidence before
  deploy.
- Deployment operators follow `docs/deployment.md` and attach the deployment
  record template to the release evidence.

## V4 Local State Migration and Coexistence

V4 stores `WorkshopRecord` data in IndexedDB with localStorage fallback and can
export/import a complete JSON envelope:

```text
kind: AI_REQUIREMENT_WORKSHOP_RECORD_EXPORT
schema_version: 1
record: WorkshopRecord
```

Production should support a staged transition:

1. Anonymous users can continue local-only workshops as V4 does today.
2. Signed-in users can import a V4 export into a Supabase-backed workshop.
3. Import preserves the original local record id as source metadata so repeated
   imports can be detected.
4. Imported messages, artifacts, links, attachments metadata, and read states are
   mapped into production tables with audit events.
5. Existing attachment extracted text can seed `attachments` and `source`
   artifacts, but raw files must be uploaded separately if they were never stored
   outside the browser.
6. Once a workshop is server-backed, Supabase becomes the source of truth and
   IndexedDB/localStorage becomes cache, draft recovery, or offline resilience.

Conflict handling should prefer append-only audit evidence and explicit status
transitions over silent overwrites. Client-generated ids may be retained as
stable external ids, but server rows should still have database primary keys.

## Rollout Risks

- RLS mistakes could expose workshops across organizations.
- Service-role or AI tokens could leak if accidentally prefixed with `VITE_` or
  returned from a status endpoint.
- AI prompts may include more workshop or attachment context than needed.
- Attachment uploads need file size, MIME type, malware scanning, retention, and
  deletion policy before production use.
- Realtime delivery can be out of order; clients need reconciliation from
  Postgres.
- Approval state can race if reviewers act on stale data.
- Local-to-server import can duplicate workshops without idempotency checks.
- Vercel Function timeouts can affect long AI turns or large imports.
- Supabase and OpenAI quota/cost controls need monitoring before broad rollout.

## Gaia Verification Loop

For this repository, verification evidence should be captured with:

```bash
npm run format
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:supabase:migrations
npm run ci
```

`npm run ci` is the full local application gate and is run by the GitHub
`verify` job. `.github/workflows/ci.yml` also has a `deployment-readiness` job
that checks the deployment docs and non-secret environment contract. For
production implementation slices, add narrower tests before relying on the full
gate:

- RLS policy tests for organization/workshop isolation.
- Applied-environment Supabase proof with `npm run test:supabase:production`
  before marking Supabase/Auth/Storage gates as production-pass.
- BFF route tests proving AI and service-role secrets never reach browser
  responses.
- Import tests proving V4 export envelopes map idempotently into server rows.
- Realtime tests proving clients reconcile from database state after missed or
  out-of-order events.

Each production issue should report commands run, results, changed paths, and
remaining risks so the next Gaia citizen inherits evidence rather than guesses.
