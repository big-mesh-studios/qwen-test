import {
  env,
  pipeline,
  InterruptableStoppingCriteria,
  TextStreamer,
} from "@huggingface/transformers";
import {
  clearModelCache,
  getModelCacheStats,
  modelCache,
  setCacheErrorHandler,
  setCacheProgressHandler,
} from "./lib/modelCache.js";

const MODEL_ID = "onnx-community/Qwen2.5-Coder-0.5B-Instruct";

// Everything is local: load from the CDN on first run, then from IndexedDB.
env.allowLocalModels = false;
env.useBrowserCache = false;
env.useCustomCache = true;
env.customCache = modelCache;

let generator = null;
let loadedKey = null;
let loadToken = 0;
let activeGeneration = null;

function post(message) {
  self.postMessage(message);
}

function describeError(error) {
  const message = error?.message ?? String(error ?? "Unknown error");
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return `Network error while contacting Hugging Face. Check your connection and try again. (${message})`;
  }
  if (/quota/i.test(message)) {
    return "The browser ran out of storage while caching the model.";
  }
  if (/webgpu/i.test(message)) {
    return `WebGPU could not start: ${message}`;
  }
  return message;
}

setCacheErrorHandler((message) => {
  post({ type: "cache-error", message });
});

setCacheProgressHandler(({ phase, file, loaded, total }) => {
  post({ type: "caching", phase, file, loaded, total });
});

async function loadModel({ device = "wasm", dtype = "q4" } = {}) {
  const key = `${device}:${dtype}`;

  if (generator && loadedKey === key) {
    const stats = await getModelCacheStats(MODEL_ID);
    post({ type: "cache", bytes: stats.bytes, files: stats.files });
    post({ type: "ready", device, dtype, cachedBytes: stats.bytes });
    return;
  }

  const token = ++loadToken;
  post({ type: "stage", stage: "cache-check" });

  const before = await getModelCacheStats(MODEL_ID);
  post({ type: "cache", bytes: before.bytes, files: before.files });
  post({ type: "stage", stage: before.bytes > 0 ? "initializing" : "downloading" });

  try {
    if (generator) {
      try {
        await generator.dispose();
      } catch {
        // The old session is being replaced; nothing else to do.
      }
      generator = null;
      loadedKey = null;
    }

    const next = await pipeline("text-generation", MODEL_ID, {
      device,
      dtype,
      progress_callback: (progress) => {
        if (token !== loadToken) return;

        if (progress.status === "progress_total") {
          post({
            type: "progress",
            loaded: progress.loaded,
            total: progress.total,
            percent: progress.progress,
            files: progress.files,
          });
        } else if (progress.status === "progress") {
          post({
            type: "file-progress",
            file: progress.file,
            loaded: progress.loaded,
            total: progress.total,
            percent: progress.progress,
          });
        } else if (progress.status === "ready") {
          post({ type: "stage", stage: "initializing" });
        }
      },
    });

    if (token !== loadToken) {
      try {
        await next.dispose();
      } catch {
        // Superseded load.
      }
      return;
    }

    generator = next;
    loadedKey = key;

    const after = await getModelCacheStats(MODEL_ID);
    post({ type: "cache", bytes: after.bytes, files: after.files });
    post({ type: "ready", device, dtype, cachedBytes: after.bytes });
  } catch (error) {
    if (token !== loadToken) return;

    // A GPU failure should not strand the app: retry on CPU.
    if (device === "webgpu") {
      post({
        type: "warning",
        message: `WebGPU could not load Qwen (${error?.message ?? error}). Falling back to WASM.`,
      });
      return loadModel({ device: "wasm", dtype });
    }

    post({ type: "error", scope: "load", message: describeError(error) });
  }
}

async function generate({ id, messages, options = {} }) {
  if (!generator) {
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

  const criteria = new InterruptableStoppingCriteria();
  activeGeneration = { id, criteria };

  let tokenCount = 0;
  const startedAt = performance.now();

  const streamer = new TextStreamer(generator.tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (text) => {
      post({ type: "token", id, text });
    },
    token_callback_function: () => {
      tokenCount += 1;
    },
  });

  const generationOptions = {
    max_new_tokens: Math.max(1, Math.round(options.maxNewTokens ?? 512)),
    repetition_penalty: Number(options.repetitionPenalty) || 1.0,
    do_sample: Number(options.temperature) > 0,
    streamer,
    stopping_criteria: criteria,
  };

  const temperature = Number(options.temperature);
  if (generationOptions.do_sample) {
    generationOptions.temperature = temperature;
    generationOptions.top_p = Number(options.topP) || 0.95;
  }

  try {
    const output = await generator(messages, generationOptions);
    const generated = output?.[0]?.generated_text;
    const text = Array.isArray(generated)
      ? (generated.at(-1)?.content ?? "")
      : String(generated ?? "");

    post({
      type: "done",
      id,
      text,
      tokens: tokenCount,
      elapsed: performance.now() - startedAt,
      stopped: criteria.interrupted,
    });
  } catch (error) {
    if (criteria.interrupted) {
      post({
        type: "done",
        id,
        text: null,
        tokens: tokenCount,
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
    activeGeneration = null;
  }
}

self.onmessage = async (event) => {
  const message = event.data;

  switch (message.type) {
    case "load":
      await loadModel({ device: message.device, dtype: message.dtype });
      break;

    case "generate":
      await generate(message);
      break;

    case "abort":
      if (activeGeneration) {
        post({ type: "stage", stage: "stopping" });
        activeGeneration.criteria.interrupt();
      }
      break;

    case "cache-stats": {
      const stats = await getModelCacheStats(MODEL_ID);
      post({ type: "cache", bytes: stats.bytes, files: stats.files });
      break;
    }

    case "clear-cache":
      await clearModelCache(MODEL_ID);
      post({ type: "cache", bytes: 0, files: 0 });
      post({ type: "cache-cleared" });
      break;

    default:
      break;
  }
};
