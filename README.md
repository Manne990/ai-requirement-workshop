# AI Requirement Workshop

AI Requirement Workshop is a collaborative requirement workshop room: a human participant, a facilitator, and specialist AI perspectives shape a shared canvas and distill accepted material into a report.

V1 is a local-first React app with deterministic workshop behavior. It is built this way so Gaia agents can test and verify the product loop before live LLM orchestration is introduced.

## Local Development

```bash
npm install
npm run dev
```

The app runs on the Vite URL printed in the terminal, usually `http://localhost:5173`.

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

The first version supports:

- A workshop room with canvas, chat, and participant strip.
- A facilitator that welcomes the human and turns discussion into canvas artifacts.
- Specialist perspectives for value, UX, risk, technical feasibility, and quality.
- Zoomable vector canvas with artifact status controls.
- Local persistence in browser storage.
- Markdown report export from accepted artifacts.

See [docs/v1-product-scope.md](docs/v1-product-scope.md) for the detailed product boundary.
