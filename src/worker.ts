import {
  CacheManager,
  Wllama,
  WllamaAbortError,
  type CacheEntry,
  type ChatCompletionChunk,
  type ChatCompletionMessage,
} from "@wllama/wllama";
import type {
  ChatRequestMessage,
  Device,
  GenerationOptions,
  WorkerRequest,
  WorkerResponse,
} from "./lib/types";

const MODEL_REPO = "bartowski/Qwen2.5-Coder-0.5B-Instruct-GGUF";
const MODEL_FILE = "Qwen2.5-Coder-0.5B-Instruct-Q4_K_M.gguf";
// Resolving the file URL directly (instead of asking the HF API) lets a
// fully cached model load without contacting Hugging Face.
const MODEL_URL = `https://huggingface.co/${MODEL_REPO}/resolve/main/${MODEL_FILE}`;
const MODEL_BYTES = 397_808_288;
const CONTEXT_TOKENS = 4096;

// Vite copies the matching wllama build into the site root. The worker bundle
// lives in `assets/`, so one level up resolves to the deployed base URL.
const WASM_URL = new URL("../wllama.wasm", self.location.href).href;
const scope = self as unknown as DedicatedWorkerGlobalScope;

let engine: Wllama | null = null;
let loadedDevice: Device | null = null;
let cacheManager: CacheManager | null = null;
let loadToken = 0;
let activeGeneration: { id: string; controller: AbortController } | null = null;

const logger = {
  debug: () => {},
  log: () => {},
  warn: (...args: unknown[]) => console.warn("[wllama]", ...args),
  error: (...args: unknown[]) => console.error("[wllama]", ...args),
};

function post(message: WorkerResponse): void {
  scope.postMessage(message);
}

function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "Unknown error");

  if (/no supported storage backend|opfs/i.test(message)) {
    return "This browser cannot open its private file storage (OPFS), which Qwen needs to cache the model. Try a recent version of Chrome, Edge, Firefox, or Safari.";
  }
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(message)) {
    return `Network error while loading Qwen. Check your connection and try again. (${message})`;
  }
  if (/quota|no space|disk space/i.test(message)) {
    return "The browser ran out of storage while saving the model. Free some space and try again.";
  }
  if (/out of memory|oom/i.test(message)) {
    return "The browser ran out of memory while loading Qwen. Close other tabs, or try the WASM backend.";
  }
  if (/webgpu|gpu/i.test(message)) {
    return `WebGPU could not start: ${message}`;
  }
  return message;
}

function getCacheManager(): CacheManager | null {
  if (cacheManager) return cacheManager;
  try {
    cacheManager = new CacheManager();
    return cacheManager;
  } catch {
    cacheManager = null;
    return null;
  }
}

function isModelEntry(entry: CacheEntry): boolean {
  const url = entry.metadata?.originalURL ?? "";
  return url.includes(MODEL_REPO) || entry.name.includes("Qwen2.5-Coder-0.5B-Instruct");
}

async function getCacheStats(): Promise<{ bytes: number; files: number }> {
  const manager = engine?.cacheManager ?? getCacheManager();
  if (!manager) return { bytes: 0, files: 0 };

  try {
    const entries = await manager.list();
    return entries.filter(isModelEntry).reduce(
      (stats, entry) => ({
        bytes: stats.bytes + entry.size,
        files: stats.files + 1,
      }),
      { bytes: 0, files: 0 },
    );
  } catch {
    return { bytes: 0, files: 0 };
  }
}

function createEngine(): Wllama {
  const manager = getCacheManager();
  return new Wllama(
    { default: WASM_URL },
    {
      logger,
      suppressNativeLog: true,
      parallelDownloads: 3,
      allowOffline: true,
      cacheManager: manager ?? undefined,
    },
  );
}

async function disposeEngine(): Promise<void> {
  if (!engine) return;
  const previous = engine;
  engine = null;
  loadedDevice = null;
  try {
    await previous.exit();
  } catch {
    // The worker is already gone; nothing to release.
  }
}

async function loadModel(
  device: Device = "wasm",
  allowFallback = true,
): Promise<void> {
  const token = ++loadToken;

  post({ type: "stage", stage: "cache-check" });
  const before = await getCacheStats();
  if (token !== loadToken) return;

  post({ type: "cache", bytes: before.bytes, files: before.files });
  const cached = before.bytes >= MODEL_BYTES;
  post({ type: "stage", stage: cached ? "initializing" : "downloading" });

  if (engine && loadedDevice === device && engine.isModelLoaded()) {
    post({ type: "ready", device, cachedBytes: before.bytes });
    return;
  }

  await disposeEngine();
  if (token !== loadToken) return;

  let next: Wllama;
  try {
    next = createEngine();
  } catch (error) {
    if (token !== loadToken) return;
    post({ type: "error", scope: "load", message: describeError(error) });
    return;
  }

  if (device === "webgpu" && !next.isSupportWebGPU()) {
    try {
      await next.exit();
    } catch {
      // Nothing was initialized yet.
    }
    if (token !== loadToken) return;

    post({
      type: "warning",
      message: "WebGPU is not available in this browser. Falling back to the WASM backend.",
    });
    if (allowFallback) {
      await loadModel("wasm", false);
    } else {
      post({
        type: "error",
        scope: "load",
        message: "WebGPU is not available in this browser.",
      });
    }
    return;
  }

  try {
    await next.loadModelFromUrl(MODEL_URL, {
      useCache: true,
      n_ctx: CONTEXT_TOKENS,
      // wllama defaults to offloading every layer. WASM must explicitly use 0.
      n_gpu_layers: device === "webgpu" ? 99999 : 0,
      progressCallback: ({ loaded, total }) => {
        if (token !== loadToken || cached) return;

        const safeTotal = total > 0 ? total : MODEL_BYTES;
        post({
          type: "progress",
          loaded,
          total: safeTotal,
          percent: Math.min(100, (loaded / safeTotal) * 100),
        });
        if (loaded >= total) post({ type: "stage", stage: "initializing" });
      },
    });

    if (token !== loadToken) {
      try {
        await next.exit();
      } catch {
        // Superseded load.
      }
      return;
    }

    engine = next;
    loadedDevice = device;

    const after = await getCacheStats();
    post({ type: "cache", bytes: after.bytes, files: after.files });
    post({ type: "ready", device, cachedBytes: after.bytes });
  } catch (error) {
    try {
      await next.exit();
    } catch {
      // The failed runtime may already have been torn down.
    }
    if (token !== loadToken) return;

    // A GPU failure should not strand the app: retry on CPU.
    if (device === "webgpu" && allowFallback) {
      post({
        type: "warning",
        message: `WebGPU could not load Qwen (${error instanceof Error ? error.message : String(error)}). Falling back to WASM.`,
      });
      await loadModel("wasm", false);
      return;
    }

    post({ type: "error", scope: "load", message: describeError(error) });
  }
}

async function generate({
  id,
  messages,
  options = {},
}: {
  id: string;
  messages: ChatRequestMessage[];
  options?: GenerationOptions;
}): Promise<void> {
  if (!engine || !engine.isModelLoaded()) {
    post({
      type: "error",
      scope: "generate",
      id,
      message: "The model is not loaded yet. Wait for setup to finish.",
    });
    return;
  }

  if (activeGeneration) {
    post({
      type: "error",
      scope: "generate",
      id,
      message: "Qwen is already generating a response.",
    });
    return;
  }

  const controller = new AbortController();
  activeGeneration = { id, controller };

  const startedAt = performance.now();
  let text = "";
  let tokens = 0;
  let chunks = 0;

  const temperature = clamp(Number(options.temperature) || 0, 0, 1.5);
  const topP = clamp(Number(options.topP) || 0.95, 0.1, 1);
  const repetitionPenalty = clamp(Number(options.repetitionPenalty) || 1, 1, 1.5);

  try {
    await engine.createChatCompletion({
      messages: messages as ChatCompletionMessage[],
      stream: true,
      onData: (chunk: ChatCompletionChunk) => {
        const delta = chunk.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta.length > 0) {
          chunks += 1;
          text += delta;
          post({ type: "token", id, text: delta });
        }

        const reported = chunk.usage?.completion_tokens ?? chunk.timings?.predicted_n;
        if (typeof reported === "number" && reported > 0) tokens = reported;
      },
      abortSignal: controller.signal,
      max_tokens: Math.max(1, Math.round(options.maxNewTokens ?? 512)),
      temp: temperature,
      top_p: topP,
      penalty_repeat: repetitionPenalty,
      cache_prompt: true,
    });

    post({
      type: "done",
      id,
      text: text.length > 0 ? text : null,
      tokens: tokens || chunks,
      elapsed: performance.now() - startedAt,
      stopped: controller.signal.aborted,
    });
  } catch (error) {
    if (controller.signal.aborted || error instanceof WllamaAbortError) {
      post({
        type: "done",
        id,
        text: text.length > 0 ? text : null,
        tokens: tokens || chunks,
        elapsed: performance.now() - startedAt,
        stopped: true,
      });
    } else {
      post({
        type: "error",
        scope: "generate",
        id,
        message: describeError(error),
      });
    }
  } finally {
    if (activeGeneration?.controller === controller) activeGeneration = null;
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

async function clearModelCache(): Promise<void> {
  const manager = engine?.cacheManager ?? getCacheManager();
  let removed = true;

  if (manager) {
    try {
      await manager.deleteMany(isModelEntry);
    } catch {
      removed = false;
    }
  }

  const stats = await getCacheStats();
  post({ type: "cache", bytes: stats.bytes, files: stats.files });
  post({ type: "cache-cleared" });
  if (!removed) {
    post({
      type: "warning",
      message: "Some cached model files could not be removed. Clear site data in your browser if the space is still used.",
    });
  }
}

async function handleRequest(message: WorkerRequest): Promise<void> {
  switch (message.type) {
    case "load":
      await loadModel(message.device ?? "wasm");
      break;

    case "generate":
      await generate({
        id: message.id,
        messages: message.messages,
        options: message.options,
      });
      break;

    case "abort":
      if (activeGeneration) {
        post({ type: "stage", stage: "stopping" });
        activeGeneration.controller.abort();
      }
      break;

    case "cache-stats": {
      const stats = await getCacheStats();
      post({ type: "cache", bytes: stats.bytes, files: stats.files });
      break;
    }

    case "clear-cache":
      await clearModelCache();
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
      message: describeError(error),
    });
  });
};
