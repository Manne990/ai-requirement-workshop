# Deployment

This runbook defines the production deployment path for AI Requirement
Workshop on Vercel with Supabase as the production backend boundary. It is a
deployment handoff document, not a secret store. No secrets belong in this
repository.

## Release Model

- GitHub Actions is the required verification gate.
- Vercel Git integration may create Preview deployments for branches and pull
  requests.
- Production should deploy from `main` only after the release gate in
  `docs/production-readiness-checklist.md` has evidence.
- The current CI workflow does not deploy, pull Vercel env vars, or require
  Vercel/Supabase/OpenAI secrets.
- If a future custom deployment workflow is added, use Vercel CLI with
  repository or organization secrets for `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and
  `VERCEL_PROJECT_ID`; do not commit `.vercel/project.json` if it reveals team
  metadata the project does not intend to publish.

## Vercel Project Settings

Use these settings for the Vite SPA plus Vercel Functions:

| Setting           | Value                         |
| ----------------- | ----------------------------- |
| Framework preset  | Vite                          |
| Install command   | `npm ci`                      |
| Build command     | `npm run build`               |
| Output directory  | `dist`                        |
| Node.js version   | Match CI major version, `24`. |
| Production branch | `main`                        |

The BFF routes live under `api/codex/`, `api/workshops/`, and
`api/mission-control/`. The local-only `/api/workshops/backup` path is
implemented by the Vite dev server and is not a production persistence path.
The `/api/workshops` record boundary is a server API contract; production use
must back it with verified organization auth and durable storage.

## Environment Contract

Use `.env.example` only as a non-secret template. Local values go in
`.env.local`. Vercel values go in the Vercel project environment settings or
through `vercel env add`.

| Variable                                   | Scope                               | Secret | Notes                                                                                                                                           |
| ------------------------------------------ | ----------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`                        | Vercel Preview and Production       | No     | Browser-safe Supabase project URL. Use a preview project or isolated preview environment.                                                       |
| `VITE_SUPABASE_ANON_KEY`                   | Vercel Preview and Production       | No     | Browser-safe anon key. RLS is the enforcement boundary.                                                                                         |
| `OPENAI_API_KEY`                           | Vercel Functions, local BFF         | Yes    | Preferred server-only AI token for `/api/codex/*`.                                                                                              |
| `CODEX_API_TOKEN`                          | Vercel Functions, local BFF         | Yes    | Optional server-only alias if `OPENAI_API_KEY` is not used.                                                                                     |
| `SUPABASE_SERVICE_ROLE_KEY`                | Vercel Functions only               | Yes    | Use only for audited privileged server work; never expose to browser code.                                                                      |
| `AI_REQUIREMENT_WORKSHOP_BACKUP_DIR`       | Local development only              | No     | Optional local disk mirror for the Vite-only backup endpoint.                                                                                   |
| `VITE_WORKSHOP_RECORD_ENDPOINT`            | Browser bundle                      | No     | Optional server-backed record endpoint, for example `/api/workshops`. Leave empty for local/Supabase adapter selection.                         |
| `AI_REQUIREMENT_WORKSHOP_SERVER_STORE_DIR` | Local development only              | No     | Optional local JSON store for the dev `/api/workshops` endpoint; not a production persistence path.                                             |
| `AI_REQUIREMENT_WORKSHOP_TELEMETRY_DIR`    | Local development, Vercel Functions | No     | Optional JSONL directory for `/api/mission-control/telemetry`.                                                                                  |
| `AI_REQUIREMENT_WORKSHOP_CODEX_AUDIT_DIR`  | Local development, Vercel Functions | No     | Optional JSONL directory for server-side Codex turn audit events. Production should replace file storage with durable authenticated audit rows. |
| `VITE_MISSION_CONTROL_TELEMETRY_ENDPOINT`  | Browser bundle                      | No     | Optional endpoint such as `/api/mission-control/telemetry`; leave empty to store telemetry only in browser storage.                             |

Do not create `VITE_OPENAI_API_KEY`, `VITE_CODEX_API_TOKEN`, or
`VITE_SUPABASE_SERVICE_ROLE_KEY`. Vite exposes every `VITE_` variable to the
browser bundle.

Example Vercel setup commands:

```bash
vercel env add VITE_SUPABASE_URL production
vercel env add VITE_SUPABASE_ANON_KEY production
vercel env add OPENAI_API_KEY production --sensitive
vercel env add SUPABASE_SERVICE_ROLE_KEY production --sensitive
vercel env add VITE_MISSION_CONTROL_TELEMETRY_ENDPOINT production

vercel env add VITE_SUPABASE_URL preview
vercel env add VITE_SUPABASE_ANON_KEY preview
vercel env add OPENAI_API_KEY preview --sensitive
```

For local development, pull Vercel values into an ignored local file only when
needed:

```bash
vercel env pull .env.local --environment=development --yes
```

## Supabase Readiness

Production deployment is blocked until Supabase evidence exists for:

- Production project created with Auth, Postgres, Storage, and Realtime enabled
  as needed by the production slice.
- Preview deployments pointed at a separate Supabase project, branch, or schema
  so preview data and auth users cannot modify production data.
- Migrations applied repeatably from `supabase/migrations/`.
- RLS enabled for every organization and workshop table.
- Policy tests prove organization isolation, membership authority, append-only
  audit behavior, and storage object access.
- Storage buckets and object paths follow the architecture path convention:
  `organizations/{organization_id}/workshops/{workshop_id}/attachments/{attachment_id}/{file_name}`.
- Supabase Auth redirect URLs include the production domain and expected Vercel
  Preview URL pattern.

The anon key is allowed in browser code only because RLS and storage policies
must enforce authorization.

## Mission Control Telemetry

The app can emit Mission Control telemetry without exposing product secrets.
When `VITE_MISSION_CONTROL_TELEMETRY_ENDPOINT` is empty, telemetry remains in
browser storage. When it points at `/api/mission-control/telemetry`, the BFF
accepts already redacted events and appends JSONL records to
`AI_REQUIREMENT_WORKSHOP_TELEMETRY_DIR` or, by default:

```text
~/.gaia/ai-requirement-workshop/telemetry/mission-control-telemetry.jsonl
```

The same route supports `GET` for local observers that need the latest records.
This is a Gaia/Mission Control feedback source, not an authority for workshop
state. Product state remains in the workshop persistence layer.

## Release Gate

Before promoting or allowing a production deploy:

1. Run `npm run ci` locally or verify the GitHub `verify` job passed.
2. Verify the GitHub `deployment-readiness` job passed.
3. Confirm Vercel Preview built with the expected environment scope.
4. Run a browser smoke test against the Preview URL for auth shell, workshop
   open, message creation, requirement approval, report view, and Codex status.
5. Confirm Supabase migration and RLS evidence is attached to the release
   record.
6. Confirm no production secret is committed or printed in build logs.
7. Record the deployment URL, commit SHA, Supabase project, migration version,
   and rollback choice.

For local migration evidence before an environment-backed Supabase run:

```bash
npm run test:supabase:migrations
```

This applies the repository migrations to a disposable Postgres database with
Supabase Auth stubs and verifies the organization/workshop helper boundaries for
owner, participant, viewer, and outsider users. It does not replace the required
production Supabase project evidence.

## Promotion And Rollback

Prefer Vercel's protected `main` deployment path for production. If the team
switches to a custom CLI deployment later, build first and deploy the prebuilt
artifact:

```bash
vercel pull --yes --environment=production --token="$VERCEL_TOKEN"
vercel build --prod --token="$VERCEL_TOKEN"
vercel deploy --prebuilt --prod --token="$VERCEL_TOKEN"
```

For rollback, use the previous Vercel production deployment or promote the last
known-good deployment. Database changes must be backward-compatible with the
previous application version or include a tested forward-only remediation. Do
not roll back code across an incompatible Supabase migration without a data
recovery plan.

## Deployment Record Template

```text
Date:
Operator:
Commit:
Vercel deployment:
Vercel environment: Preview | Production
Supabase project/environment:
Supabase migration version:
CI verify:
CI deployment-readiness:
Smoke evidence:
Known caveats:
Rollback target:
```
