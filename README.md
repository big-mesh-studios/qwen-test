# Qwen Coder Chat

A fully client-side chat app for **Qwen2.5-Coder-0.5B-Instruct (q4)**. It runs in
the browser with [Transformers.js](https://huggingface.co/docs/transformers.js)
and [Solid 2.0](https://github.com/solidjs/solid), and keeps the model weights in
IndexedDB so the 860 MB download happens only once.

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
  binary and Node cannot instantiate the WASI fallback, so `vite.config.js`
  detects `process.platform === "android"` and compiles JSX with the pure-JS
  Babel plugin instead. Set `SOLID_BABEL=1` to force that path anywhere.
- `pnpm-workspace.yaml` disables install scripts for `onnxruntime-node` and
  `protobufjs`. They are Node-only transitive dependencies and are not needed
  for the browser build, which avoids `EBADPLATFORM`/postinstall failures.
- The package manager is pinned with `packageManager`; use pnpm rather than npm
  so the lockfile stays authoritative.

## Project layout

```
src/
  App.jsx                 app state, worker messaging, persistence
  worker.js               Transformers.js pipeline, streaming, abort, progress
  lib/modelCache.js       Web Cache API-shaped cache backed by IndexedDB
  lib/idb.js              IndexedDB stores and helpers
  lib/storage.js          conversations, settings, theme
  lib/markdown.js         dependency-free Markdown parser
  components/             sidebar, chat, composer, settings, overlay, icons
  styles.css              responsive dark/light design
```

## Scripts

| Command        | What it does                          |
| -------------- | ------------------------------------- |
| `pnpm dev`     | Start the Vite dev server             |
| `pnpm build`   | Build the static site into `dist/`    |
| `pnpm preview` | Serve the production build locally    |
