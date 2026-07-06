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

The production BFF routes live under `api/codex/`. The local-only
`/api/workshops/backup` path is implemented by the Vite dev server and is not a
production persistence path.

## Environment Contract

Use `.env.example` only as a non-secret template. Local values go in
`.env.local`. Vercel values go in the Vercel project environment settings or
through `vercel env add`.

| Variable                             | Scope                         | Secret | Notes                                                                                     |
| ------------------------------------ | ----------------------------- | ------ | ----------------------------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`                  | Vercel Preview and Production | No     | Browser-safe Supabase project URL. Use a preview project or isolated preview environment. |
| `VITE_SUPABASE_ANON_KEY`             | Vercel Preview and Production | No     | Browser-safe anon key. RLS is the enforcement boundary.                                   |
| `OPENAI_API_KEY`                     | Vercel Functions, local BFF   | Yes    | Preferred server-only AI token for `/api/codex/*`.                                        |
| `CODEX_API_TOKEN`                    | Vercel Functions, local BFF   | Yes    | Optional server-only alias if `OPENAI_API_KEY` is not used.                               |
| `SUPABASE_SERVICE_ROLE_KEY`          | Vercel Functions only         | Yes    | Use only for audited privileged server work; never expose to browser code.                |
| `AI_REQUIREMENT_WORKSHOP_BACKUP_DIR` | Local development only        | No     | Optional local disk mirror for the Vite-only backup endpoint.                             |

Do not create `VITE_OPENAI_API_KEY`, `VITE_CODEX_API_TOKEN`, or
`VITE_SUPABASE_SERVICE_ROLE_KEY`. Vite exposes every `VITE_` variable to the
browser bundle.

Example Vercel setup commands:

```bash
vercel env add VITE_SUPABASE_URL production
vercel env add VITE_SUPABASE_ANON_KEY production
vercel env add OPENAI_API_KEY production --sensitive
vercel env add SUPABASE_SERVICE_ROLE_KEY production --sensitive

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
