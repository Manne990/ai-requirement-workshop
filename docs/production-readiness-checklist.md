# Production Readiness Checklist

Issues: #35 PROD-16, #38 PROD-19, #39 PROD-20. Related baseline:
#20 PROD-01, #34 PROD-15.

This checklist defines the first production release gate for AI Requirement
Workshop. It is intentionally evidence-based: every gate maps to an observed or
plausible failure mode from the current architecture and must be closed with a
repeatable command, test, review artifact, or deployment record.

## Release Gate

Use this table as the release decision record. `State` must be `Pass`, `Fail`,
or `N/A for first production release`. `Evidence` must name the command, test,
manual check, migration, deployment record, or issue that proves the state.

| Gate                       | Issues   | Failure mode being controlled                                                                                   | Required evidence                                                                                                                                          | State                            | Evidence                                                                                                                               |
| -------------------------- | -------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| CI verification            | #35, #39 | A release ships with failing format, lint, types, tests, or build.                                              | `npm run ci` passes on the release candidate.                                                                                                              | Fail                             | Pending release-candidate run.                                                                                                         |
| Production smoke path      | #35      | Core workshop flow regresses without a browser-safe smoke test.                                                 | CI-safe App smoke covers auth shell, opening a workshop, adding a message, approving a requirement artifact, and viewing the generated report.             | Pass                             | `src/App.test.tsx` production smoke test runs through `npm run test` and therefore `npm run ci`.                                       |
| External-service fakes     | #35      | Tests require committed secrets or live AI/backend services.                                                    | Codex and backup endpoints are mocked or deterministic in test.                                                                                            | Pass                             | `src/App.test.tsx` uses deterministic `fetch` fakes for `/api/codex/status`, `/api/codex/workshop-turn`, and `/api/workshops/backup`.  |
| Accessibility smoke        | #35, #38 | Keyboard or screen-reader users cannot reach core controls.                                                     | Tests assert named regions, semantic buttons, dialog names, close controls, `aria-pressed` mode state, live chat log, and readiness meter labels.          | Pass                             | `src/App.test.tsx` accessibility smoke test.                                                                                           |
| Responsive layout guard    | #38      | Desktop or tablet viewports get page-level horizontal scroll, clipped controls, or unbounded chat/canvas areas. | Tests assert root overflow lock, bounded shell/workspace, chat vertical scroll, participant horizontal scroll, and mobile one-column workspace breakpoint. | Pass                             | `src/App.test.tsx` CSS contract test using `src/App.css` and `src/index.css`.                                                          |
| Auth boundary              | #21, #39 | Browser receives privileged auth or service-role secrets.                                                       | Architecture review confirms only browser-safe public config reaches Vite code; server-only secrets stay in Vercel/Supabase.                               | Fail                             | Supabase Auth adapter exists and only uses `VITE_SUPABASE_URL` plus `VITE_SUPABASE_ANON_KEY`; production project and review pending.   |
| Organization isolation     | #22, #39 | Users can read or modify workshops outside their organization.                                                  | Supabase schema, RLS policies, and policy tests prove tenant isolation.                                                                                    | Fail                             | Initial Supabase schema and RLS text tests exist; migration has not been applied to an isolated Supabase environment yet.              |
| Collaboration authority    | #39      | Realtime clients overwrite state or miss conflict reconciliation.                                               | Realtime design and tests prove Postgres remains source of truth after missed or out-of-order events.                                                      | Fail                             | Not implemented in the local-first V4 app.                                                                                             |
| Durable persistence        | #23, #39 | Production data is browser-only or cannot recover after device loss.                                            | Server-backed workshop rows, attachment metadata, export/import, and backup/recovery procedure are verified.                                               | Fail                             | Initial Supabase tables exist for server-backed records; app repository still uses local persistence until Supabase integration lands. |
| AI safety and audit        | #36, #39 | AI calls expose secrets, send excess context, or lack audit evidence.                                           | BFF tests prove tokens are never returned, prompt payload is minimized, JSON is validated, and audit events are written.                                   | Fail                             | Vercel-compatible Codex routes and shared JSON validation exist; server-side audit writes are still pending.                           |
| Traceability and approvals | #39      | Accepted requirements cannot be traced to source material or approval decisions.                                | Tests or review prove requirements, risks, decisions, artifacts, and approvals preserve links and audit history.                                           | Fail                             | Local artifact links and status controls exist; production approval workflow is pending.                                               |
| Prototype loop             | #35, #39 | Prototype generation/viewing/signoff is treated as production-ready before the product has a durable workflow.  | Either verified production prototype flow exists or the release explicitly excludes prototypes.                                                            | N/A for first production release | Prototype loop is a first-release non-goal below.                                                                                      |
| Deployment configuration   | #39      | Production deploy uses wrong env vars, leaked secrets, or unverified preview data.                              | Vercel project env vars, preview isolation, and build command are reviewed before release.                                                                 | Fail                             | Deployment review pending.                                                                                                             |
| Documentation handoff      | #39      | Release status depends on tribal knowledge between Gaia citizens.                                               | Checklist, architecture doc, changed paths, verification commands, and open risks are reported with each production slice.                                 | Pass                             | `docs/production-readiness-checklist.md` plus citizen handoff reports.                                                                 |

## First Production Release Non-Goals

These are not allowed to become implicit blockers unless an observed failure mode
proves they must move into the gate:

- Full prototype generation, viewing, or signoff workflow.
- Multi-organization admin console beyond the minimum membership model needed
  for authorization.
- Offline conflict resolution beyond preserving local draft recovery and export.
- Public marketplace, billing, analytics dashboards, or advanced workspace
  analytics.
- General-purpose document management outside workshop attachments and exports.
- Replacing the current local export/import path for anonymous workshops.

## Rollback, Export, And Data Recovery

Before production launch:

- Every server-backed workshop must remain exportable to a complete JSON or
  documented recovery format that includes messages, artifacts, links,
  attachments metadata, read states, approvals, and audit identifiers.
- Production deploy rollback must keep database migrations compatible with the
  previous application version or include a tested forward-only remediation.
- Attachment storage recovery must document how object paths map back to
  workshop and organization rows.
- AI-generated content should be reproducible from stored prompts, model ids,
  response ids when available, and audit events without storing server secrets.
- Local V4 export/import must remain available as a user-controlled escape hatch
  until server-backed recovery has been exercised.

## Verification Commands

Run targeted commands before the full gate when touching production readiness
surfaces:

```bash
npm run test -- src/App.test.tsx
npm run ci
```

`npm run ci` remains the release-candidate gate. It invokes `npm run test`, so
the CI-safe production smoke, accessibility, and responsive contract checks in
`src/App.test.tsx` run without committed secrets or live external services.

## Updating This Checklist

Only add a new gate when it controls a concrete failure mode that can be
reproduced, reviewed, or tied to an accepted production architecture risk. Each
new gate must include objective evidence fields so future Gaia citizens can
close it without guessing.
