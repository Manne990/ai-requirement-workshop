# AI Requirement Workshop V1 Scope

AI Requirement Workshop is a collaborative workshop room for shaping digital-system requirements together with AI participants.

V1 is intentionally local and deterministic. It proves the product loop before adding live LLM orchestration, multi-human presence, or backend persistence.

## Product Principles

- The canvas is the primary workspace.
- Chat and canvas evolve together.
- The facilitator supports the process without hiding the human participant.
- Specialist agents contribute perspectives, not final decisions.
- Every artifact keeps provenance to the message or artifact that created it.
- Accepted workshop material can be distilled into an exportable report.

## V1 User Flow

1. The human enters the workshop room.
2. The facilitator welcomes the human and creates an initial canvas.
3. The human describes the system, service, or requirement problem.
4. The facilitator turns discussion into traceable artifacts.
5. Specialist perspectives add questions, risks, assumptions, and verification prompts.
6. The human accepts, parks, or rejects artifacts.
7. Accepted artifacts are distilled into a markdown report.

## Included In V1

- React/Vite single-page app.
- Main layout with canvas, chat, and participant strip.
- Zoomable vector canvas using React Flow.
- Deterministic facilitator behavior.
- Deterministic specialist perspectives for value, UX, risk, technical, and quality lenses.
- Local persistence using browser storage.
- Markdown report export.
- Automated tests and GitHub Actions CI.

## Not Included In V1

- Real LLM calls.
- Multi-user collaboration.
- Authentication.
- Backend storage.
- Advanced diagram editing.
- Production deployment.

## Feedback Loop

V1 must remain easy for agents and humans to verify:

- `npm run test` verifies domain and UI behavior.
- `npm run typecheck` verifies TypeScript contracts.
- `npm run lint` verifies static code quality.
- `npm run build` verifies production packaging.
- `npm run ci` runs the complete local gate.
