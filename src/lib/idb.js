/**
 * Tiny promise wrapper around IndexedDB.
 *
 * Two stores:
 *   model-files   – Hugging Face model/tokenizer files (Blobs), keyed by URL
 *   conversations – chat sessions, keyed by id
 */

const DB_NAME = "qwen-coder-chat";
const DB_VERSION = 1;

export const MODEL_STORE = "model-files";
export const CHAT_STORE = "conversations";

let dbPromise = null;

export function isIndexedDBAvailable() {
  try {
    return typeof indexedDB !== "undefined";
  } catch {
    return false;
  }
}

export function openDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (!isIndexedDBAvailable()) {
      reject(new Error("IndexedDB is not available in this browser."));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(MODEL_STORE)) {
        const store = db.createObjectStore(MODEL_STORE, { keyPath: "url" });
        store.createIndex("cachedAt", "cachedAt");
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

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function idbGet(storeName, key) {
  const db = await openDB();
  return requestResult(db.transaction(storeName, "readonly").objectStore(storeName).get(key));
}

export async function idbGetAll(storeName) {
  const db = await openDB();
  return requestResult(db.transaction(storeName, "readonly").objectStore(storeName).getAll());
}

export async function idbPut(storeName, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => resolve(value);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted."));
  });
}

export async function idbDelete(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted."));
  });
}

export async function idbClear(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted."));
  });
}

/**
 * Walk every record in a store without loading blobs into memory.
 * `visit` receives the record; the cursor is advanced automatically.
 */
export async function idbForEach(storeName, visit) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const request = tx.objectStore(storeName).openCursor();

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      try {
        visit(cursor.value);
      } catch (error) {
        reject(error);
        return;
      }
      cursor.continue();
    };

    request.onerror = () => reject(request.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted."));
  });
}

/**
 * Delete every record matching a predicate.
 */
export async function idbDeleteWhere(storeName, predicate) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const request = tx.objectStore(storeName).openCursor();

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      if (predicate(cursor.value)) cursor.delete();
      cursor.continue();
    };

    request.onerror = () => reject(request.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted."));
  });
}

/**
 * Size and file count for a store, optionally filtered.
 * Uses the stored byte size, never reading the blob itself.
 */
export async function idbStats(storeName, predicate = () => true) {
  let bytes = 0;
  let files = 0;

  await idbForEach(storeName, (record) => {
    if (!predicate(record)) return;
    files += 1;
    bytes += record.size ?? record.blob?.size ?? 0;
  });

  return { bytes, files };
}
