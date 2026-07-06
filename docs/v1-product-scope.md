# AI Requirement Workshop V1 Scope

AI Requirement Workshop is a collaborative workshop room for shaping digital-system requirements together with AI participants.

V1 was intentionally local and deterministic. It proved the product loop before live LLM orchestration, multi-human presence, or backend persistence.

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

## V2 Runtime Update

V2 kept the same local-first UI but replaced the workshop turn generator with a local Codex bridge:

- Only Codex/OpenAI is supported.
- The configured model is `gpt-5.5`.
- The browser calls a local Vite endpoint.
- The Vite endpoint reads `OPENAI_API_KEY` or `CODEX_API_TOKEN` from local environment configuration.
- Tokens and config files such as `.env.local` must stay outside git.
- The deterministic V1 domain behavior remains useful for tests, report generation, and fallback validation, but live workshop turns are expected to come from Codex.

## V3 Continuation, Readiness, and Attachments

V3 adds the practical features needed for a workshop to continue across days:

- Workshops are stored as persistent records with ID, title, created/updated timestamps, session state, and read agent insight state.
- IndexedDB is the primary local store because workshops and extracted file text can become larger than a single simple browser preference.
- localStorage remains as a fallback for tests and browsers without IndexedDB.
- The app autosaves relevant state changes and provides a workshop switcher for creating or reopening workshops.
- Readiness is computed from observable state instead of facilitator self-report.
- The readiness panel shows score, level, summary, and concrete gaps before report mode.
- Users can attach preparatory material to a chat turn.
- Text, Markdown, CSV, JSON, DOCX, and XLS/XLSX files are parsed locally in the browser.
- Attachments become `source` artifacts so later requirements, risks, assumptions, and questions can remain traceable to supplied material.

## V4 Durable Product State

V4 hardens the continuation model so important workshop state is not trapped only in runtime memory or a single browser database:

- Each workshop record can be exported as a complete JSON envelope.
- A complete JSON envelope can be imported back into the app and continued.
- Autosave still writes to IndexedDB with localStorage fallback.
- During local development, autosave also mirrors the latest record to disk through `/api/workshops/backup`.
- The default disk mirror path is `~/.gaia/ai-requirement-workshop/workshops`.
- `AI_REQUIREMENT_WORKSHOP_BACKUP_DIR` can point the mirror to another local directory.
- The UI distinguishes browser save, disk backup, unavailable backup, and failed backup states.
- Import validation normalizes missing optional fields and rejects records without a workshop session or id.

This is still not a remote database or multi-user sync. It is a durable local artifact boundary that makes recovery, audit, and cross-machine handoff possible.

## Feedback Loop

V1 must remain easy for agents and humans to verify:

- `npm run test` verifies domain and UI behavior.
- `npm run typecheck` verifies TypeScript contracts.
- `npm run lint` verifies static code quality.
- `npm run build` verifies production packaging.
- `npm run ci` runs the complete local gate.
