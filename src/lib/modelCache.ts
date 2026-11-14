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
  type StoredModelFile,
} from "./idb";

export interface CacheProgress {
  phase: "start" | "progress" | "done" | "saved";
  file: string;
  loaded: number;
  total: number;
}

type CacheErrorHandler = (message: string) => void;
type CacheProgressHandler = (progress: CacheProgress) => void;
type PutProgressCallback = (data: { progress: number; loaded: number; total: number }) => void;

let cacheErrorHandler: CacheErrorHandler | null = null;
let cacheProgressHandler: CacheProgressHandler | null = null;

export function setCacheErrorHandler(handler: CacheErrorHandler | null): void {
  cacheErrorHandler = handler;
}

export function setCacheProgressHandler(handler: CacheProgressHandler | null): void {
  cacheProgressHandler = handler;
}

export function cacheKey(request: string | Request): string {
  return typeof request === "string" ? request : (request?.url ?? String(request));
}

function fileNameFromUrl(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.split("/").pop() || url);
  } catch {
    return String(url).split("/").pop() || String(url);
  }
}

async function readResponseBlob(response: Response, key: string): Promise<Blob> {
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
  async match(request: string): Promise<Response | undefined> {
    if (!isIndexedDBAvailable()) return undefined;

    try {
      const key = cacheKey(request);
      const record = await idbGet<StoredModelFile>(MODEL_STORE, key);
      if (!record?.blob) return undefined;

      const headers = new Headers(record.headers ?? []);
      if (!headers.has("content-length")) headers.set("content-length", String(record.size));
      return new Response(record.blob, { status: 200, statusText: "OK", headers });
    } catch {
      return undefined;
    }
  },

  async put(
    request: string,
    response: Response,
    progressCallback?: PutProgressCallback,
  ): Promise<void> {
    if (!isIndexedDBAvailable() || !response) return;

    const key = cacheKey(request);

    try {
      const existing = await idbGet<StoredModelFile>(MODEL_STORE, key);
      if (existing?.blob) return;

      const blob = await readResponseBlob(response, key);
      const headers: [string, string][] = Array.from(response.headers.entries());
      if (!headers.some(([name]) => name.toLowerCase() === "content-length")) {
        headers.push(["content-length", String(blob.size)]);
      }

      await idbPut<StoredModelFile>(MODEL_STORE, {
        url: key,
        blob,
        size: blob.size,
        type: blob.type,
        headers,
        cachedAt: Date.now(),
      });

      cacheProgressHandler?.({
        phase: "saved",
        file: fileNameFromUrl(key),
        loaded: blob.size,
        total: blob.size,
      });
      progressCallback?.({ progress: 100, loaded: blob.size, total: blob.size });
    } catch (error) {
      const message =
        error instanceof DOMException && error.name === "QuotaExceededError"
          ? "The browser's storage quota was exceeded. The model will still run, but it could not be saved for next time."
          : `Could not save the model to IndexedDB: ${error instanceof Error ? error.message : String(error)}`;
      cacheErrorHandler?.(message);
    }
  },

  async delete(request: string): Promise<boolean> {
    const key = cacheKey(request);
    try {
      await idbDeleteWhere<StoredModelFile>(MODEL_STORE, (record) => record.url === key);
      return true;
    } catch {
      return false;
    }
  },
};

export async function getModelCacheStats(modelId: string | null = null): Promise<{
  bytes: number;
  files: number;
}> {
  try {
    return await idbStats<StoredModelFile>(MODEL_STORE, (record) =>
      modelId ? String(record.url).includes(modelId) : true,
    );
  } catch {
    return { bytes: 0, files: 0 };
  }
}

export async function clearModelCache(modelId: string | null = null): Promise<boolean> {
  try {
    await idbDeleteWhere<StoredModelFile>(MODEL_STORE, (record) =>
      modelId ? String(record.url).includes(modelId) : true,
    );
    return true;
  } catch {
    return false;
  }
}
