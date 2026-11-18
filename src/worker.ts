import {
  CacheManager,
  Wllama,
  WllamaAbortError,
  type CacheEntry,
  type ChatCompletionChunk,
  type ChatCompletionMessage,
} from "@wllama/wllama";
import { QWEN35_CHAT_TEMPLATE } from "./lib/qwen35-chat-template";
import { getModel, MODELS, modelUrl, type ModelSpec } from "./lib/models";
import type {
  CacheStats,
  ChatRequestMessage,
  Device,
  GenerationOptions,
  ModelCacheStats,
  WorkerRequest,
  WorkerResponse,
} from "./lib/types";

// Some GGUFs ship without tokenizer.chat_template. Supply the matching template
// only for those files.
const CHAT_TEMPLATES: Record<string, string> = {
  "qwen35-2b": QWEN35_CHAT_TEMPLATE,
};

// Keep the old repo/file names so "Clear cache" can reclaim the previous model
// after users upgrade.
const LEGACY_MODEL_REPO = "bartowski/Qwen2.5-Coder-0.5B-Instruct-GGUF";
const LEGACY_MODEL_FILE = "Qwen2.5-Coder-0.5B-Instruct-Q4_K_M.gguf";

// Vite copies the matching wllama build into the site root. The worker bundle
// lives in `assets/`, so one level up resolves to the deployed base URL.
const WASM_URL = new URL("../wllama.wasm", self.location.href).href;
const scope = self as unknown as DedicatedWorkerGlobalScope;

let engine: Wllama | null = null;
let loadedDevice: Device | null = null;
let loadedModelId: string | null = null;
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
    return "This browser cannot open its private file storage (OPFS), which the model needs to cache its weights. Try a recent version of Chrome, Edge, Firefox, or Safari.";
  }
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(message)) {
    return `Network error while loading the model. Check your connection and try again. (${message})`;
  }
  if (/quota|no space|disk space/i.test(message)) {
    return "The browser ran out of storage while saving the model. Free some space and try again.";
  }
  if (/out of memory|oom/i.test(message)) {
    return "The browser ran out of memory while loading the model. Close other tabs, choose a smaller model, or try the WASM backend.";
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

function matchesModel(entry: CacheEntry, model: ModelSpec): boolean {
  const url = (entry.metadata?.originalURL ?? "").toLowerCase();
  const name = entry.name.toLowerCase();
  const file = model.file.toLowerCase();
  return url.includes(file) || name.includes(file);
}

function isModelEntry(entry: CacheEntry): boolean {
  const url = entry.metadata?.originalURL ?? "";
  const name = entry.name.toLowerCase();
  return (
    MODELS.some((model) => matchesModel(entry, model)) ||
    url.includes(LEGACY_MODEL_REPO) ||
    name.includes(LEGACY_MODEL_FILE.toLowerCase())
  );
}

async function getModelCacheStats(model: ModelSpec): Promise<CacheStats> {
  const manager = engine?.cacheManager ?? getCacheManager();
  if (!manager) return { bytes: 0, files: 0 };

  try {
    const entries = await manager.list();
    return entries.filter((entry) => matchesModel(entry, model)).reduce(
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

async function getAllModelCacheStats(): Promise<ModelCacheStats[]> {
  const manager = engine?.cacheManager ?? getCacheManager();
  if (!manager) {
    return MODELS.map((model) => ({ modelId: model.id, bytes: 0, files: 0 }));
  }

  try {
    const entries = await manager.list();
    return MODELS.map((model) => {
      const stats = entries
        .filter((entry) => matchesModel(entry, model))
        .reduce(
          (total, entry) => ({
            bytes: total.bytes + entry.size,
            files: total.files + 1,
          }),
          { bytes: 0, files: 0 },
        );
      return { modelId: model.id, ...stats };
    });
  } catch {
    return MODELS.map((model) => ({ modelId: model.id, bytes: 0, files: 0 }));
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
  loadedModelId = null;
  try {
    await previous.exit();
  } catch {
    // The worker is already gone; nothing to release.
  }
}

async function loadModel(
  modelId: string = MODELS[0].id,
  device: Device = "wasm",
  allowFallback = true,
): Promise<void> {
  const model = getModel(modelId);
  const token = ++loadToken;

  post({ type: "stage", stage: "cache-check" });
  const before = await getModelCacheStats(model);
  if (token !== loadToken) return;

  post({ type: "cache", modelId: model.id, bytes: before.bytes, files: before.files });
  const cached = before.bytes >= model.bytes;
  post({ type: "stage", stage: cached ? "initializing" : "downloading" });

  if (
    engine &&
    loadedDevice === device &&
    loadedModelId === model.id &&
    engine.isModelLoaded()
  ) {
    post({ type: "ready", modelId: model.id, device, cachedBytes: before.bytes });
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
      await loadModel(model.id, "wasm", false);
    } else {
      post({
        type: "error",
        scope: "load",
        message: "WebGPU is not available in this browser.",
      });
    }
    return;
  }

  const chatTemplate = CHAT_TEMPLATES[model.id];

  try {
    await next.loadModelFromUrl(modelUrl(model), {
      useCache: true,
      n_ctx: model.contextTokens,
      // Most Bonsai packs carry their own template; the community Qwen GGUF
      // does not, so supply the official template for that file only.
      ...(chatTemplate ? { chat_template: chatTemplate } : {}),
      jinja: true,
      // wllama defaults to offloading every layer. WASM must explicitly use 0.
      n_gpu_layers: device === "webgpu" ? 99999 : 0,
      progressCallback: ({ loaded, total }) => {
        if (token !== loadToken || cached) return;

        const safeTotal = total > 0 ? total : model.bytes;
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
    loadedModelId = model.id;

    const after = await getModelCacheStats(model);
    post({ type: "cache", modelId: model.id, bytes: after.bytes, files: after.files });
    post({ type: "ready", modelId: model.id, device, cachedBytes: after.bytes });
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
        message: `WebGPU could not load ${model.name} (${error instanceof Error ? error.message : String(error)}). Falling back to WASM.`,
      });
      await loadModel(model.id, "wasm", false);
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
      message: "The model is already generating a response.",
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
        // Most GGUFs stream `content`, but reasoning models can put their
        // tokens in `reasoning_content`. Fall back to it so the UI still
        // receives updates instead of sitting on "Thinking" until the end.
        const delta = chunk.choices?.[0]?.delta as
          | { content?: string | null; reasoning_content?: string | null }
          | undefined;
        const piece =
          typeof delta?.content === "string"
            ? delta.content
            : typeof delta?.reasoning_content === "string"
              ? delta.reasoning_content
              : "";
        if (piece.length > 0) {
          chunks += 1;
          text += piece;
          post({ type: "token", id, text: piece });
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
      // Qwen3.5 and Bonsai both accept this template flag. Non-thinking mode
      // keeps short coding answers from turning into a long reasoning trace.
      chat_template_kwargs: { enable_thinking: false },
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

  const stats = await getAllModelCacheStats();
  post({ type: "cache-summary", models: stats });
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
      await loadModel(message.modelId ?? MODELS[0].id, message.device ?? "wasm");
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
      if (message.modelId) {
        const model = getModel(message.modelId);
        const stats = await getModelCacheStats(model);
        post({ type: "cache", modelId: model.id, bytes: stats.bytes, files: stats.files });
      } else {
        const models = await getAllModelCacheStats();
        post({ type: "cache-summary", models });
      }
      break;
    }

    case "cache-summary": {
      const models = await getAllModelCacheStats();
      post({ type: "cache-summary", models });
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
