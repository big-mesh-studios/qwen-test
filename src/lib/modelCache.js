/**
 * A Web Cache API-compatible cache backed by IndexedDB.
 *
 * Transformers.js asks a cache for `match(request)` and `put(request, response)`
 * so it can skip re-downloading model files. We keep the file bytes as Blobs in
 * IndexedDB, which survives reloads and works in a Web Worker.
 */

import {
  MODEL_STORE,
  idbDeleteWhere,
  idbGet,
  idbPut,
  idbStats,
  isIndexedDBAvailable,
} from "./idb.js";

let cacheErrorHandler = null;
let cacheProgressHandler = null;

export function setCacheErrorHandler(handler) {
  cacheErrorHandler = handler;
}

export function setCacheProgressHandler(handler) {
  cacheProgressHandler = handler;
}

export function cacheKey(request) {
  return typeof request === "string" ? request : (request?.url ?? String(request));
}

function fileNameFromUrl(url) {
  try {
    return decodeURIComponent(new URL(url).pathname.split("/").pop() || url);
  } catch {
    return String(url).split("/").pop() || String(url);
  }
}

async function readResponseBlob(response, key) {
  const total = Number(response.headers.get("content-length")) || 0;
  const file = fileNameFromUrl(key);

  // Transformers.js has already read the response into a buffer before it
  // calls `put`, so there is no live network stream left to observe here.
  // Cloning the response and collecting every chunk would keep a second full
  // copy of the weights in memory (hundreds of MB), which is enough to run a
  // phone out of RAM. Ask the browser for one Blob instead; large Blobs are
  // backed by the browser's blob store and can be written to IndexedDB by
  // reference.
  cacheProgressHandler?.({ phase: "start", file, loaded: 0, total });

  const blob = await response.blob();
  cacheProgressHandler?.({ phase: "done", file, loaded: blob.size, total: blob.size || total });
  return blob;
}

export const modelCache = {
  async match(request) {
    if (!isIndexedDBAvailable()) return undefined;

    try {
      const key = cacheKey(request);
      const record = await idbGet(MODEL_STORE, key);
      if (!record?.blob) return undefined;

      const headers = new Headers(record.headers ?? []);
      if (!headers.has("content-length")) headers.set("content-length", String(record.size));
      return new Response(record.blob, { status: 200, statusText: "OK", headers });
    } catch {
      return undefined;
    }
  },

  async put(request, response, progressCallback) {
    if (!isIndexedDBAvailable() || !response) return;

    const key = cacheKey(request);

    try {
      const existing = await idbGet(MODEL_STORE, key);
      if (existing?.blob) return;

      const blob = await readResponseBlob(response, key);
      const headers = Array.from(response.headers.entries());
      if (!headers.some(([name]) => name.toLowerCase() === "content-length")) {
        headers.push(["content-length", String(blob.size)]);
      }

      await idbPut(MODEL_STORE, {
        url: key,
        blob,
        size: blob.size,
        type: blob.type,
        headers,
        cachedAt: Date.now(),
      });

      cacheProgressHandler?.({ phase: "saved", file: fileNameFromUrl(key), loaded: blob.size, total: blob.size });
      progressCallback?.({ progress: 100, loaded: blob.size, total: blob.size });
    } catch (error) {
      const message =
        error?.name === "QuotaExceededError"
          ? "The browser's storage quota was exceeded. The model will still run, but it could not be saved for next time."
          : `Could not save the model to IndexedDB: ${error?.message ?? error}`;
      cacheErrorHandler?.(message);
    }
  },

  async delete(request) {
    if (!isIndexedDBAvailable()) return false;
    const key = cacheKey(request);
    try {
      await idbDeleteWhere(MODEL_STORE, (record) => record.url === key);
      return true;
    } catch {
      return false;
    }
  },
};

export async function getModelCacheStats(modelId = null) {
  try {
    return await idbStats(MODEL_STORE, (record) =>
      modelId ? String(record.url).includes(modelId) : true,
    );
  } catch {
    return { bytes: 0, files: 0 };
  }
}

export async function clearModelCache(modelId = null) {
  try {
    await idbDeleteWhere(MODEL_STORE, (record) =>
      modelId ? String(record.url).includes(modelId) : true,
    );
    return true;
  } catch {
    return false;
  }
}
