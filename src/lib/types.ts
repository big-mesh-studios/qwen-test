export type Role = "system" | "user" | "assistant";
export type Device = "wasm" | "webgpu";
export type Theme = "dark" | "light";
export type ModelStatus = "idle" | "loading" | "ready" | "error";

export type Stage =
  | "cache-check"
  | "downloading"
  | "initializing"
  | "stopping"
  | "ready"
  | "error";

export interface MessageMeta {
  tokens: number;
  elapsed: number;
}

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
  streaming?: boolean;
  stopped?: boolean;
  error?: string;
  meta?: MessageMeta;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

export interface Settings {
  systemPrompt: string;
  temperature: number;
  topP: number;
  maxNewTokens: number;
  repetitionPenalty: number;
  device: Device;
}

export interface CacheStats {
  bytes: number;
  files: number;
}

export interface GenerationOptions {
  maxNewTokens?: number;
  temperature?: number;
  topP?: number;
  repetitionPenalty?: number;
}

export type ChatRequestMessage = Pick<ChatMessage, "role" | "content">;

export type WorkerRequest =
  | { type: "load"; device?: Device }
  | {
      type: "generate";
      id: string;
      messages: ChatRequestMessage[];
      options?: GenerationOptions;
    }
  | { type: "abort" }
  | { type: "cache-stats" }
  | { type: "clear-cache" };

export type WorkerResponse =
  | { type: "stage"; stage: Stage }
  | {
      type: "progress";
      loaded: number;
      total: number;
      percent?: number;
    }
  | { type: "cache"; bytes: number; files: number }
  | { type: "cache-cleared" }
  | { type: "warning"; message: string }
  | { type: "ready"; device: Device; cachedBytes?: number }
  | { type: "token"; id: string; text: string }
  | {
      type: "done";
      id: string;
      text: string | null;
      tokens: number;
      elapsed: number;
      stopped: boolean;
    }
  | {
      type: "error";
      scope: "load" | "generate";
      id?: string;
      message: string;
    };
