# Project Roadmap: RAG JS s1mple (vanilla)

Goal: evolve a lightweight RAG agent powered by plain HTML/CSS/JS on the frontend and a tiny Node.js proxy on the backend.

## Phase 1 - Project skeleton ✅
- Core files: `index.html`, `style.css`, `script.js`.
- Wire assets together (`<link>` for CSS, `<script defer>` for JS).
- Smoke-test via Live Server (VS Code: Go Live).

## Phase 2 - Chat MVP (no RAG) ✅
- Markup: chat card with header, message list and composer.
- UX: submit on Enter or button; auto-scroll to newest message.
- Persistence: cache chat history in `localStorage`.
- Assistant stub: fake replies to validate UI flow.

## Phase 3 - Glassmorphism UI ✅
- Gradient background, frosted surfaces (`backdrop-filter`).
- Accent gradient (purple/cyan) for CTA and branding.
- Accessibility: legible contrast, focus states, responsive < 640 px.

## Phase 4 - Prep for RAG ✅
- Extract transport layer behind `sendMessage`.
- Isolate view rendering, history store and transport logic.
- Reserve config placeholders for secrets/feature flags.

## Phase 5 - Retrieval-Augmented Generation ✅
- Ingestion CLI (`ingest.js`) reads `.txt`/`.md`, chunks, embeds with `text-embedding-3-small` and upserts into Qdrant.
- Proxy (`POST /api/chat`) embeds the latest user question, queries Qdrant, injects snippets into the model prompt and returns citations.
- Responses include `references` to show which knowledge chunks were used.

## Phase 6a - Secure GPT API (server proxy) ✅
- Node proxy (`server.js`) keeps `OPENAI_API_KEY` server-side.
- Streams chat requests to `https://api.openai.com/v1/chat/completions`.
- CORS allows Live Server (`localhost:5500`) to reach the proxy (`localhost:8787`).
- Frontend calls the proxy; no API keys in the browser.

## Phase 6 - Polish (ongoing)
- Harden error handling, rate limits, empty states.
- Productivity options: copy answer, clear history, typing indicator.
- Lightweight debugging telemetry via `console.log`.

## Knowledge ingestion workflow
1. Prepare content inside `docs/` (nested folders supported, `.txt` or `.md`).
2. Ensure environment is set:
   ```
   $env:OPENAI_API_KEY="sk-..."
   $env:QDRANT_URL="http://localhost:6333"
   $env:QDRANT_COLLECTION="docs"
   # Optional for cloud: $env:QDRANT_API_KEY="..."
   ```
3. Seed or refresh vectors:
   ```
   node ingest.js --dir ./docs       # upsert chunks
   node ingest.js --dir ./docs --reset  # truncate collection, then upsert
   ```
4. Start the proxy: `node server.js` (same env vars).
5. Launch Live Server; chat now enriches answers with retrieved context.

## How to run
- Backend: `node server.js` (PowerShell example above).
- Frontend: Live Server or any static server pointing at `index.html`.
- Optional: `node ingest.js --dry-run` to inspect chunking without uploads.
- Inspect responses in the UI; citations appear when RAG is active.
