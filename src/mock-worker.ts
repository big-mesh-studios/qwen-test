import { getModel, MODELS } from "./lib/models";
import type { ChatRequestMessage, WorkerRequest, WorkerResponse } from "./lib/types";

/**
 * Dev-only stand-in for the real model worker.
 *
 * Open the app with `?mock=1` to exercise the model picker and chat UI
 * (streaming, stop, persistence, Markdown) without downloading a GGUF.
 */
const scope = self as unknown as DedicatedWorkerGlobalScope;

let controller: AbortController | null = null;
const cachedModels = new Set<string>();

function post(message: WorkerResponse): void {
  scope.postMessage(message);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function replyFor(messages: ChatRequestMessage[]): string {
  const lastUser =
    [...messages].reverse().find((message) => message.role === "user")?.content ?? "hello";

  return [
    "**Mock model** — no GGUF was downloaded.",
    "",
    "You said:",
    "",
    `> ${lastUser.replace(/\n/g, "\n> ")}`,
    "",
    "Here is a small code block so streaming and Markdown can be checked:",
    "",
    "```ts",
    "const answer = 42;",
    "console.log(answer);",
    "```",
    "",
    "Switch to a real model by opening the app without `?mock=1`.",
  ].join("\n");
}

function chunkText(text: string): string[] {
  const chunks: string[] = [];
  let index = 0;
  while (index < text.length) {
    const size = 3 + (index % 5);
    chunks.push(text.slice(index, index + size));
    index += size;
  }
  return chunks;
}

function cacheSummary() {
  return MODELS.map((model) => ({
    modelId: model.id,
    bytes: cachedModels.has(model.id) ? model.bytes : 0,
    files: cachedModels.has(model.id) ? 1 : 0,
  }));
}

async function load(modelId?: string): Promise<void> {
  const model = getModel(modelId);
  const isCached = cachedModels.has(model.id);

  post({ type: "stage", stage: "cache-check" });
  await sleep(120);
  post({
    type: "cache",
    modelId: model.id,
    bytes: isCached ? model.bytes : 0,
    files: isCached ? 1 : 0,
  });
  post({ type: "stage", stage: "initializing" });
  await sleep(220);
  cachedModels.add(model.id);
  post({ type: "cache", modelId: model.id, bytes: model.bytes, files: 1 });
  post({ type: "ready", modelId: model.id, device: "wasm", cachedBytes: model.bytes });
}

async function generate(id: string, messages: ChatRequestMessage[]): Promise<void> {
  if (controller) {
    post({
      type: "error",
      scope: "generate",
      id,
      message: "The mock model is already generating a response.",
    });
    return;
  }

  const active = new AbortController();
  controller = active;

  const text = replyFor(messages);
  const startedAt = performance.now();
  let sent = "";
  let tokens = 0;

  for (const piece of chunkText(text)) {
    if (active.signal.aborted) break;
    await sleep(18);
    sent += piece;
    tokens += 1;
    post({ type: "token", id, text: piece });
  }

  const stopped = active.signal.aborted;
  controller = null;
  post({
    type: "done",
    id,
    text: sent,
    tokens,
    elapsed: performance.now() - startedAt,
    stopped,
  });
}

async function handleRequest(message: WorkerRequest): Promise<void> {
  switch (message.type) {
    case "load":
      await load(message.modelId);
      break;

    case "generate":
      await generate(message.id, message.messages);
      break;

    case "abort":
      controller?.abort();
      break;

    case "cache-stats":
      if (message.modelId) {
        const model = getModel(message.modelId);
        const isCached = cachedModels.has(model.id);
        post({
          type: "cache",
          modelId: model.id,
          bytes: isCached ? model.bytes : 0,
          files: isCached ? 1 : 0,
        });
      } else {
        post({ type: "cache-summary", models: cacheSummary() });
      }
      break;

    case "cache-summary":
      post({ type: "cache-summary", models: cacheSummary() });
      break;

    case "clear-cache":
      cachedModels.clear();
      post({ type: "cache-summary", models: cacheSummary() });
      post({ type: "cache-cleared" });
      break;

    default:
      break;
  }
}

scope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  void handleRequest(event.data).catch((error) => {
    post({
      type: "error",
      scope: "load",
      message: error instanceof Error ? error.message : String(error),
    });
  });
};
