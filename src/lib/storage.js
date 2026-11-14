import {
  CHAT_STORE,
  idbClear,
  idbDelete,
  idbGetAll,
  idbPut,
} from "./idb.js";
import { clamp, uid } from "./utils.js";

const SETTINGS_KEY = "qwen-coder-settings";
const THEME_KEY = "qwen-coder-theme";

export const DEFAULT_SETTINGS = {
  systemPrompt:
    "You are Qwen Coder, a concise and helpful coding assistant. Answer with Markdown. Put code in fenced code blocks with a language tag. Explain the important parts briefly, and mention trade-offs or edge cases when they matter.",
  temperature: 0.6,
  topP: 0.95,
  maxNewTokens: 512,
  repetitionPenalty: 1.05,
  device: "wasm",
  dtype: "q4",
};

export function createConversation() {
  const now = Date.now();
  return {
    id: uid("chat"),
    title: "New chat",
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
}

export async function loadConversations() {
  try {
    const records = await idbGetAll(CHAT_STORE);
    return records
      .map((record) => ({
        ...record,
        // A placeholder can be left behind if the tab closed mid-generation.
        messages: (record.messages ?? []).filter(
          (message) => message.role !== "assistant" || message.content || message.error,
        ),
      }))
      .filter((record) => record.messages.length > 0)
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  } catch {
    return [];
  }
}

export async function saveConversation(conversation) {
  const messages = conversation.messages.map((message) => {
    const { streaming, ...rest } = message;
    return rest;
  });

  try {
    await idbPut(CHAT_STORE, {
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      messages,
    });
  } catch {
    // Storage can fail (quota, private mode). The chat keeps working in memory.
  }
}

export async function deleteConversationRecord(id) {
  try {
    await idbDelete(CHAT_STORE, id);
  } catch {
    // Ignore storage failures.
  }
}

export async function clearConversationRecords() {
  try {
    await idbClear(CHAT_STORE);
  } catch {
    // Ignore storage failures.
  }
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);

    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      temperature: clamp(parsed.temperature ?? DEFAULT_SETTINGS.temperature, 0, 1.5),
      topP: clamp(parsed.topP ?? DEFAULT_SETTINGS.topP, 0.1, 1),
      maxNewTokens: Math.round(
        clamp(parsed.maxNewTokens ?? DEFAULT_SETTINGS.maxNewTokens, 64, 2048),
      ),
      repetitionPenalty: clamp(
        parsed.repetitionPenalty ?? DEFAULT_SETTINGS.repetitionPenalty,
        1,
        1.5,
      ),
      device: parsed.device === "webgpu" ? "webgpu" : "wasm",
      dtype: parsed.dtype === "q4f16" || parsed.dtype === "q8" ? parsed.dtype : "q4",
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function persistSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Preferences just won't persist.
  }
}

export function loadTheme() {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // Ignore.
  }
  try {
    return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function persistTheme(theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Ignore.
  }
}
