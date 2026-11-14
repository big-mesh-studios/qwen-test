# Qwen Coder Chat

A fully client-side chat app for **Qwen2.5-Coder-0.5B-Instruct (q4)**. It runs in
the browser with [Transformers.js](https://huggingface.co/docs/transformers.js)
and [Solid 2.0](https://github.com/solidjs/solid), is written in TypeScript, and
keeps the model weights in IndexedDB so the 860 MB download happens only once.

There is no application server: Vite only serves the static app, and inference,
storage, and chat history all stay in the browser.

## Features

- **Local inference** — Qwen2.5-Coder-0.5B-Instruct q4 in a Web Worker (WASM
  by default, experimental WebGPU option).
- **First-run download + IndexedDB cache** — progress, speed, per-file status,
  and a cache-size indicator. Reloads reuse the cached weights.
- **Streaming responses** — token-by-token Markdown with code blocks and copy
  buttons, stop/abort support, and token/elapsed stats.
- **Chat app UX** — persistent conversation list, generated titles, dark/light
  themes, responsive sidebar, keyboard shortcuts, and Markdown rendering.
- **Settings** — system prompt, temperature, top-p, max new tokens, repetition
  penalty, compute backend, and cache management.
- **No backend** — chats are stored in IndexedDB; settings and theme in
  `localStorage`.
- **Static hosting friendly** — GitHub Actions publishes to GitHub Pages, and a
  folder-scoped service worker restores `SharedArrayBuffer` support where the
  host cannot send COOP/COEP headers.

## Requirements

- Node.js 20 or newer
- pnpm 11 (`corepack enable` is the easiest way to get the pinned version)
- A modern browser with WebAssembly. WebGPU is optional and only used when
  selected in Settings.
- **About 2–3 GB of free RAM** while the model initializes, and enough disk
  space for the ~874 MB of model files. A desktop browser is recommended.

## Run it

```bash
pnpm install
pnpm dev
```

Open the URL Vite prints (usually <http://localhost:5173>).

Production build:

```bash
pnpm build
pnpm preview
```

`pnpm build` type-checks the project with `tsc --noEmit` before running
`vite build`. Run `pnpm typecheck` on its own to check types without building.

## Cross-origin isolation and SharedArrayBuffer

The threaded ONNX Runtime WASM build uses `SharedArrayBuffer`, which browsers
only expose to cross-origin isolated pages. The app needs two things:

1. `Cross-Origin-Opener-Policy: same-origin` and
   `Cross-Origin-Embedder-Policy: require-corp` on the page response.
2. `Cross-Origin-Resource-Policy: cross-origin` on responses the page loads
   from other origins (or hosts that set compatible CORP headers).

Vite dev and preview send those headers directly (`vite.config.ts`), so
`window.crossOriginIsolated` is true locally.

GitHub Pages cannot send custom headers. To make the deployed app work there,
[`public/coi-serviceworker.js`](public/coi-serviceworker.js) intercepts
same-origin GET responses and adds the COOP/COEP/CORP headers. It is registered
from the app's own base URL, so its scope is exactly the folder the app is served
from — publishing at `/<repo>/` isolates `/<repo>/` without affecting the rest of
`github.io`. [`src/lib/isolation.ts`](src/lib/isolation.ts) registers the worker
and reloads the page once after it takes control, because the navigation response
itself must carry the headers. A `sessionStorage` flag prevents reload loops if a
browser still refuses to isolate the page.

The worker only handles requests inside its scope. Requests to Hugging Face and
the ONNX Runtime CDN are not rewritten, though they still need to allow
cross-origin embedding (the CDNs do).

## Deploy to GitHub Pages

Two workflows live in `.github/workflows/`:

- `ci.yml` — installs with pnpm, runs `pnpm typecheck`, builds, and checks that
  the service worker and model worker were emitted. Runs on pushes, pull
  requests, and manually.
- `gh-pages.yml` — builds on pushes to `main` (or manually) and publishes
  `dist/` to the `gh-pages` branch with
  [`peaceiris/actions-gh-pages`](https://github.com/peaceiris/actions-gh-pages).

One-time repository setup:

1. Push this project to GitHub.
2. In **Settings → Pages**, set **Source** to **Deploy from a branch**, then
   choose the **`gh-pages`** branch and the **`/ (root)`** folder.
3. Push to `main` (or run the **Deploy to GitHub Pages** workflow manually) and
   wait for the action to finish.

The Vite build uses a relative `base` (`./`) for production, so the same build
works at `https://<user>.github.io/<repo>/` and at an origin root. Workers and
the service worker resolve relative to the deployed URL at runtime.

## Model and cache behavior

1. On startup the worker checks IndexedDB for the model files.
2. On a cache miss it downloads the q4 ONNX weights, tokenizer, and configs
   from `huggingface.co` (about 874 MB in total, ~862 MB of weights).
3. Files are written to IndexedDB (`qwen-coder-chat` → `model-files`) as Blobs.
4. Later launches load the same files from IndexedDB. The sidebar and top bar
   show the cached size.
5. **Settings → Storage → Clear cached model** deletes the cached files. The
   current chat keeps working until reload; the next load downloads again.

The ONNX Runtime WASM runtime itself is loaded by Transformers.js from
`cdn.jsdelivr.net`, so the first initialization needs network access even if the
weights are cached. Chat history and weights are never uploaded anywhere.

> The model is a demo-sized 0.5B coding model. Expect short, simple answers and
> CPU-bound token generation, not cloud-model quality or speed.

## Android / Termux notes

- The official Solid plugin loads a native compiler. Termux has no prebuilt
  binary and Node cannot instantiate the WASI fallback, so `vite.config.ts`
  detects `process.platform === "android"` and compiles TSX with the pure-JS
  Babel plugin (including `@babel/preset-typescript`) instead. Set
  `SOLID_BABEL=1` to force that path anywhere.
- `pnpm-workspace.yaml` disables install scripts for `onnxruntime-node` and
  `protobufjs`. They are Node-only transitive dependencies and are not needed
  for the browser build, which avoids `EBADPLATFORM`/postinstall failures.
- The package manager is pinned with `packageManager`; use pnpm rather than npm
  so the lockfile stays authoritative.

## Project layout

```
src/
  App.tsx                 app state, worker messaging, persistence
  worker.ts               Transformers.js pipeline, streaming, abort, progress
  index.tsx               app bootstrap and isolation registration
  lib/types.ts            shared chat, settings, and worker message types
  lib/isolation.ts        folder-scoped COI service worker registration
  lib/modelCache.ts       Web Cache API-shaped cache backed by IndexedDB
  lib/idb.ts              IndexedDB stores and helpers
  lib/storage.ts          conversations, settings, theme
  lib/markdown.ts         dependency-free Markdown parser
  components/             sidebar, chat, composer, settings, overlay, icons
  styles.css              responsive dark/light design
public/
  coi-serviceworker.js    COOP/COEP/CORP service worker for static hosts
.github/workflows/
  ci.yml                  typecheck + build checks
  gh-pages.yml            build and deploy to the gh-pages branch
```

## Scripts

| Command          | What it does                              |
| ---------------- | ----------------------------------------- |
| `pnpm dev`       | Start the Vite dev server                 |
| `pnpm typecheck` | Type-check without emitting files         |
| `pnpm build`     | Type-check, then build the static site    |
| `pnpm preview`   | Serve the production build locally        |
