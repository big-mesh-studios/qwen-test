# Qwen Coder Chat

A fully client-side chat app for local coding models. Choose **Qwen3.5-2B**
(Q4_K_M) or Prism ML's **Ternary Bonsai 2** (2B, 4B, or 9B, Q2_0) on the start
screen. Models run in the browser with [wllama](https://github.com/ngxson/wllama)
(llama.cpp compiled to WebAssembly) and
[Solid 2.0](https://github.com/solidjs/solid), are written in TypeScript, and are
cached in the browser's private file storage after the first download.

There is no application server: Vite only serves the static app, and inference,
storage, and chat history all stay in the browser.

## Features

- **Model picker** — choose Qwen3.5-2B or Bonsai 2 (2B/4B/9B) at startup, then
  switch again from Settings. Each GGUF is downloaded only when needed.
- **Local inference** — Qwen Q4_K_M or Bonsai ternary Q2_0 in a Web Worker
  (WASM by default, experimental WebGPU option).
- **First-run download + OPFS cache** — progress, speed, and per-model cache
  indicators. Every model is cached separately, so switching back does not
  download it again.
- **Streaming responses** — token-by-token Markdown with code blocks and copy
  buttons, stop/abort support, and token/elapsed stats.
- **Chat app UX** — persistent conversation list, generated titles, dark/light
  themes, responsive sidebar, keyboard shortcuts, and Markdown rendering.
- **Settings** — model, system prompt, temperature, top-p, max new tokens,
  repetition penalty, compute backend, cache management, and a reset-to-defaults
  button (including the system prompt).
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
- **Disk/cache:** about 0.55 GB for Bonsai 2B, 1.21 GB for 4B, 2.56 GB for 9B,
  or 1.27 GB for Qwen3.5-2B.
- **RAM:** roughly 2–3 GB free for the 2B models and Qwen; the 9B pack is
  desktop-class and needs considerably more. A desktop browser is recommended.

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

### Test the chat UI without the model

Run `pnpm dev` and open <http://localhost:5173/?mock=1>. A dev-only mock worker
speaks the same worker protocol as the real model, including the model picker,
and streams a fake Markdown reply. Streaming, stop, persistence, and reactivity
can be tested without downloading a GGUF. Drop `?mock=1` to use a real model.

`pnpm check:reactivity` runs a small offline harness for the Solid 2.0 keyed
message list, using `flush()` to force streamed updates.

## Cross-origin isolation and SharedArrayBuffer

wllama's threaded llama.cpp WASM build uses `SharedArrayBuffer`, which browsers
only expose to cross-origin isolated pages. The app needs two things:

1. `Cross-Origin-Opener-Policy: same-origin` and
   `Cross-Origin-Embedder-Policy: require-corp` on the page response.
2. `Cross-Origin-Resource-Policy: cross-origin` on responses the page loads
   from other origins (or hosts that set compatible CORP headers).

Vite dev and preview send those headers directly (`vite.config.ts`), so
`window.crossOriginIsolated` is true locally. Without isolation wllama still
runs, but with a single thread.

GitHub Pages cannot send custom headers. To make the deployed app work there,
[`public/coi-serviceworker.js`](public/coi-serviceworker.js) intercepts
same-origin GET responses and adds the COOP/COEP/CORP headers. It is registered
from the app's own base URL, so its scope is exactly the folder the app is served
from — publishing at `/<repo>/` isolates `/<repo>/` without affecting the rest of
`github.io`. [`src/lib/isolation.ts`](src/lib/isolation.ts) registers the worker
and reloads the page once after it takes control, because the navigation response
itself must carry the headers. A `sessionStorage` flag prevents reload loops if a
browser still refuses to isolate the page.

The worker only handles requests inside its scope. Requests to Hugging Face are
not rewritten, though they still need to allow cross-origin embedding (they do).

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

The start screen offers one file per model, and the worker downloads only the
one you choose:

| Model | Hugging Face repo / file | Size | Quant |
| - | - | -: | - |
| Qwen3.5 2B | `KoarAI/Qwen3.5-2B-text-only-Q4_K_M-GGUF` · `qwen3.5-2b-text-only-q4_k_m.gguf` | 1.27 GB | Q4_K_M |
| Bonsai 2 · 2B | `prism-ml/Ternary-Bonsai-2-2B-gguf` · `Ternary-Bonsai-2-2B-Q2_0.gguf` | 0.55 GB | Q2_0 ternary |
| Bonsai 2 · 4B | `prism-ml/Ternary-Bonsai-2-4B-gguf` · `Ternary-Bonsai-2-4B-Q2_0.gguf` | 1.21 GB | Q2_0 ternary |
| Bonsai 2 · 9B | `prism-ml/Ternary-Bonsai-2-9B-gguf` · `Ternary-Bonsai-2-9B-Q2_0.gguf` | 2.56 GB | Q2_0 ternary |

Bonsai 2 uses the upstream `Q2_0` container, not Prism ML's fork-only `PQ2_0`
or `PTQ1_0` packings, because the bundled wllama/llama.cpp build can read
`Q2_0` and includes the Hadamard activation runtime the weights need. The
Bonsai weights come from the
[`prism-ml` organisation](https://huggingface.co/prism-ml) on Hugging Face. The
27B pack is not offered: its 7.6 GB file cannot fit in the browser's 32-bit
WebAssembly address space.

The Qwen community GGUF was converted without `tokenizer.chat_template`, so the
worker supplies the [official Qwen3.5 template](https://huggingface.co/Qwen/Qwen3.5-2B)
from `src/lib/qwen35-chat-template.ts` when loading it. The Bonsai GGUFs carry
their own template.

1. On startup the worker lists cached GGUF files in wllama's cache manager,
   which uses the browser's origin-private file system (OPFS), and reports which
   models are already available.
2. When you pick a model, a cache miss downloads the file directly from
   `huggingface.co` and streams it into OPFS. The picker and progress screen show
   the size and whether a full or partial copy exists.
3. Later launches read each cached file from OPFS without calling the Hugging
   Face API. The sidebar and top bar show the active model's cached size;
   Settings shows the total for all cached models.
4. **Settings → Clear model cache** deletes every cached model file. The current
   chat keeps working until reload; the next load downloads again.

The wllama WASM runtime is copied into the build and served from the app's own
origin, so it stays in lockstep with the npm package and needs no third-party
CDN. Chat history and weights are never uploaded anywhere.

Upgrading from the earlier Transformers.js build bumps the IndexedDB schema to
version 2, which drops the old `model-files` store and reclaims the ~874 MB ONNX
cache automatically.

> The 2B models are CPU-bound on the WASM backend. Expect local-model speed, not
> cloud-model speed; the larger Bonsai packs trade memory for quality.

## Android / Termux notes

- The official Solid plugin loads a native compiler. Termux has no prebuilt
  binary and Node cannot instantiate the WASI fallback, so `vite.config.ts`
  detects `process.platform === "android"` and compiles TSX with the pure-JS
  Babel plugin (including `@babel/preset-typescript`) instead. Set
  `SOLID_BABEL=1` to force that path anywhere.
- The package manager is pinned with `packageManager`; use pnpm rather than npm
  so the lockfile stays authoritative.
- Loading the full model on a phone is memory-hungry. Close other tabs if the
  browser reloads the page during initialization.

## Project layout

```
src/
  App.tsx                 app state, worker messaging, persistence
  worker.ts               wllama loading, streaming, abort, OPFS cache
  mock-worker.ts          dev-only fake model for UI testing (?mock=1)
  index.tsx               app bootstrap and isolation registration
  lib/models.ts           model catalogue, sizes, and Hugging Face URLs
  lib/types.ts            shared chat, settings, and worker message types
  lib/isolation.ts        folder-scoped COI service worker registration
  lib/idb.ts              IndexedDB stores and helpers
  lib/storage.ts          conversations, settings, theme
  lib/qwen35-chat-template.ts  chat template for the community Qwen GGUF
  lib/markdown.ts         dependency-free Markdown parser
  components/             sidebar, chat, composer, settings, overlay, icons
  styles.css              responsive dark/light design
public/
  coi-serviceworker.js    COOP/COEP/CORP service worker for static hosts
scripts/
  reactivity-check.mjs    offline Solid keyed-list reactivity harness
.github/workflows/
  ci.yml                  typecheck + build checks
  gh-pages.yml            build and deploy to the gh-pages branch
```

## Scripts

| Command          | What it does                              |
| ---------------- | ----------------------------------------- |
| `pnpm dev`       | Start the Vite dev server                 |
| `pnpm typecheck` | Type-check without emitting files         |
| `pnpm check:reactivity` | Run the offline Solid keyed-list harness |
| `pnpm build`     | Type-check, then build the static site    |
| `pnpm preview`   | Serve the production build locally        |
