# Production Export Format

AI Requirement Workshop has two user-controlled export paths:

- `AI_REQUIREMENT_WORKSHOP_RECORD_EXPORT` is a recovery envelope. It preserves
  the saved workshop record so a workshop can be imported and continued.
- `AI_REQUIREMENT_WORKSHOP_PRODUCTION_REVIEW_PACKAGE` is a production review
  package. It is generated from saved workshop state for reviewers who need
  readiness, traceability, requirement quality, audit evidence, prototype
  coverage, and report material in one JSON artifact.

The review package is downloaded from the report dialog with
`Download review package`.

## Review Package Contract

The current package is `schema_version: 1` and includes:

- `readiness`: `ready`, `needs-review`, or `blocked`.
- `provenance`: generator, generated timestamp, workshop updated timestamp, and
  input counts.
- `stakeholderReport`: the sanitized report shown to workshop users.
- `requirementRegister`: approved or baselined requirements with state, version,
  acceptance criteria, source refs, approval metadata, history, and audit event
  ids.
- `audit`: audit summary, requirement-history evidence, missing-evidence
  warnings, and export audit ids when present.
- `traceability`: coverage, gaps, review gaps, and warnings.
- `requirementQuality`: deterministic quality findings and blocker/warning
  counts.
- `prototypeSummary`: prototype/version coverage, sanitized version snapshots,
  element definitions, current preview HTML, and prototype feedback evidence.
- `appendix`: decisions, risks, open questions, and attachment metadata.
- `redactions`: sensitive-text findings applied while generating the package.

The package must be treated as evidence derived from stored workshop state. It
must not be hand-edited to make a release look ready.

## Verification

When this format changes, run:

```bash
npm run test -- src/domain/productionExport.test.ts src/App.test.tsx
npm run test:e2e -- e2e/production-workshop.spec.ts
npm run ci
```

GitHub Actions `verify` must pass before the package is considered releasable.
