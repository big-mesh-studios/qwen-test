/**
 * Tiny promise wrapper around IndexedDB.
 *
 * Version 1 also kept Transformers.js model files in a `model-files` store.
 * Version 2 drops that store so upgrading users get the old ~874 MB ONNX
 * cache back; wllama now stores its GGUF model in OPFS instead.
 */

import type { ChatMessage } from "./types";

const DB_NAME = "qwen-coder-chat";
const DB_VERSION = 2;

const LEGACY_MODEL_STORE = "model-files";
export const CHAT_STORE = "conversations";

export interface StoredConversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function isIndexedDBAvailable(): boolean {
  try {
    return typeof indexedDB !== "undefined";
  } catch {
    return false;
  }
}

export function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (!isIndexedDBAvailable()) {
      reject(new Error("IndexedDB is not available in this browser."));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (db.objectStoreNames.contains(LEGACY_MODEL_STORE)) {
        db.deleteObjectStore(LEGACY_MODEL_STORE);
      }

      if (!db.objectStoreNames.contains(CHAT_STORE)) {
        const store = db.createObjectStore(CHAT_STORE, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      // If another tab asks for a newer schema, get out of its way.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };

    request.onerror = () => reject(request.error ?? new Error("Could not open IndexedDB."));
    request.onblocked = () => reject(new Error("IndexedDB upgrade is blocked by another tab."));
  }).catch((error) => {
    dbPromise = null;
    throw error;
  });

  return dbPromise;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function idbGetAll<T>(storeName: string): Promise<T[]> {
  const db = await openDB();
  return requestResult<T[]>(
    db.transaction(storeName, "readonly").objectStore(storeName).getAll(),
  );
}

export async function idbPut<T>(storeName: string, value: T): Promise<T> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => resolve(value);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted."));
  });
}

export async function idbDelete(storeName: string, key: IDBValidKey): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted."));
  });
}

export async function idbClear(storeName: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted."));
  });
}
