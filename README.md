# AI Requirement Workshop

AI Requirement Workshop is a collaborative requirement workshop room: a human participant, a facilitator, and specialist AI perspectives shape a shared canvas and distill accepted material into a report.

V4 is a local-first React app with a local Codex bridge and durable workshop state. The browser talks to the Vite dev server, and the dev server calls OpenAI Responses API with the current Codex model (`gpt-5.5`). API tokens stay in local environment configuration and must never be committed.

## Local Development

```bash
npm install
npm run dev
```

The app runs on the Vite URL printed in the terminal, usually `http://localhost:5173`.

## Local Codex Configuration

Set one of these values locally before starting the dev server:

```bash
OPENAI_API_KEY="your_local_key"
```

or:

```bash
CODEX_API_TOKEN="your_local_key"
```

For file-based local config, put the value in `.env.local`. `.env*` files are ignored by git. Do not commit tokens, captured headers, or generated config containing credentials.

## Workshop State And Backups

Workshop records are autosaved in browser storage. During local development, the app also mirrors each workshop record to disk through the Vite dev server.

Default backup location:

```text
~/.gaia/ai-requirement-workshop/workshops
```

Override it when starting the dev server:

```bash
AI_REQUIREMENT_WORKSHOP_BACKUP_DIR="/path/to/workshop-backups" npm run dev
```

The UI also supports explicit `Export` and `Import` of a complete workshop JSON file. Export/import files contain the full workshop session, messages, artifacts, attachments metadata/text, and read agent insight state.

## Verification

```bash
npm run format
npm run lint
npm run typecheck
npm run test
npm run build
npm run ci
```

`npm run ci` runs the full local gate used by GitHub Actions.

## V1 Scope

The first version established:

- A workshop room with canvas, chat, and participant strip.
- A facilitator that welcomes the human and turns discussion into canvas artifacts.
- Specialist perspectives for value, UX, risk, technical feasibility, and quality.
- Zoomable vector canvas with artifact status controls.
- Local persistence in browser storage.
- Markdown report export from accepted artifacts.

See [docs/v1-product-scope.md](docs/v1-product-scope.md) for the detailed product boundary.

## V2 Scope

V2 added:

- Codex-only AI support using `gpt-5.5`.
- Local Vite endpoint for Codex status and workshop turns.
- No provider selector and no alternate AI providers.
- Local-only token configuration through environment variables or `.env.local`.
- UI status showing whether the local Codex token is available.

## V3 Scope

V3 added:

- Persistent workshop records with IndexedDB as primary local storage and localStorage fallback.
- A workshop switcher for creating, opening, autosaving, and continuing earlier workshops.
- Readiness scoring based on observable canvas state: accepted problem/actors/requirements, handled risks, open questions, and traceability.
- File attachments in chat submissions.
- Local extraction for text, Markdown, CSV, JSON, DOCX, and XLS/XLSX files.
- Attachment provenance through `source` artifacts on the canvas.

## V4 Scope

The current version adds:

- Complete workshop JSON export/import.
- Local disk backup mirror through `/api/workshops/backup`.
- Backup status in the UI, separating browser persistence from disk backup.
- Export/import schema validation and import normalization.
- Unit tests for export/import and backup behavior.
- Dev-server smoke coverage for the backup endpoint.

No remote app database, authentication, or multi-user sync is included yet.
