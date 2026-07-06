# Production Research Benchmark

This note records the external reference points used to steer the production
hardening backlog. It is not a feature wish list. New work still needs a
reproducible failure mode or a release gate gap before it becomes required.

## What Best In Class Requires

### Requirements Engineering

Authoritative requirements-management guidance emphasizes bidirectional
traceability, source rationale, and change impact analysis.

References:

- NASA requirements management guidance:
  https://www.nasa.gov/reference/6-2-requirements-management/
- ISO/IEC/IEEE 29148 overview:
  https://www.iso.org/obp/ui/en/
- Defense Acquisition University requirements-management overview:
  https://content1.waru.edu/DAUMIG_se-brainbook_189/content/Management%20Processes/Requirements-Management.html

Implications for this product:

- Requirements must keep source links, lifecycle history, approval state, and
  audit evidence.
- Accepted material cannot remain a pile of artifacts. It needs merge/split,
  traceability, and production export paths.
- Changes to approved requirements need visible consequences and history.

Backlog pressure:

- #25 first-class requirement lifecycle
- #26 artifact consolidation and requirement merge/split
- #27 traceability graph
- #33 audit/version/export

### AI Safety And Governance

AI-assisted workshops need runtime boundaries for prompt injection, sensitive
information disclosure, auditability, and human accountability.

References:

- OWASP Top 10 for LLM Applications:
  https://owasp.org/www-project-top-10-for-large-language-model-applications/
- OWASP LLM01 prompt injection:
  https://genai.owasp.org/llmrisk/llm01-prompt-injection/
- NIST AI Risk Management Framework:
  https://www.nist.gov/itl/ai-risk-management-framework

Implications for this product:

- AI context sent to Codex must be minimized and validated.
- Secrets and privileged organization data must never be exposed to the browser
  or to model payloads.
- AI-generated requirements and summaries need provenance and review status.
- The app should make it easy to see what was generated, by which model path,
  from which context, and what human decision followed.

Backlog pressure:

- #28 requirement quality checks
- #33 audit/version/export
- #36 security and privacy hardening

### Multi-User Collaboration

Best-in-class workshop tools make collaboration live, visible, and recoverable.
Real-time chat, comments, feedback, presence, and structured work formats are
core expectations.

References:

- FigJam collaboration features:
  https://www.figma.com/figjam/
- FigJam online whiteboard:
  https://www.figma.com/figjam/online-whiteboard/
- Miro enterprise collaboration and security positioning:
  https://miro.com/
  https://miro.com/enterprise/

Implications for this product:

- Multiple humans must be able to join the same organization and workshop.
- Presence should be visible but not become the source of truth.
- Realtime events must recover from missed or out-of-order messages.
- Collaboration state needs durable server-backed records, not only local
  browser state.

Backlog pressure:

- #22 organizations, memberships, invites, RBAC
- #23 server-backed workshop records
- #24 realtime collaboration and presence

### Accessibility

WCAG 2.2 frames accessibility requirements as technology-independent,
testable success criteria. This matches our need for agent-verifiable UI gates.

Reference:

- W3C WCAG 2.2:
  https://www.w3.org/TR/WCAG22/

Implications for this product:

- Core workshop controls need names, roles, keyboard access, focus states, and
  bounded scroll ownership.
- Visual canvas work must not hide text, actions, or decision state from users
  who rely on structured UI regions.
- Accessibility smoke tests belong in CI, not only manual review.

Backlog pressure:

- #35 end-to-end production tests
- #38 layout and accessibility hardening when present

### Authorization Boundary

Supabase recommends Row Level Security as the database-level authorization
boundary, especially when browser clients access data through public anon keys.

Reference:

- Supabase Row Level Security documentation:
  https://supabase.com/docs/guides/database/postgres/row-level-security

Implications for this product:

- Organization isolation must be enforced by Postgres RLS policies, not only by
  UI state.
- Browser configuration may include public Supabase values, but not service-role
  secrets.
- Production readiness needs evidence that RLS policies work before release.

Backlog pressure:

- #22 organizations and memberships
- #23 server-backed workshop records
- #36 security and privacy hardening

## Current Assessment

The current implementation is moving in the right direction:

- Local workshop UX, Codex loop, attachments, autosave, import/export, telemetry,
  realtime browser smoke, requirement lifecycle, consolidation, quality signals,
  audit ledger, and production review export now exist.
- The biggest remaining production blockers are not more canvas polish. They are
  server-backed organization authority, durable multi-user persistence, RLS
  evidence, attachment storage, and AI/security audit boundaries.

## Non-Goal Guardrail

Do not add generic enterprise features just because market leaders have them.
Add a feature only when it closes one of these:

- a reproducible failure mode,
- an explicit production release gate,
- a user workflow needed for the first production target,
- or a security/privacy/accessibility obligation that can be verified.
