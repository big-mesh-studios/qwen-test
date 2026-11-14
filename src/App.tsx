import {
  createEffect,
  createMemo,
  createSignal,
  onSettled,
  Show,
} from "solid-js";
import { ChatView } from "./components/ChatView";
import { Composer } from "./components/Composer";
import { LoadingOverlay } from "./components/LoadingOverlay";
import { SettingsDialog } from "./components/SettingsDialog";
import { Sidebar } from "./components/Sidebar";
import {
  IconAlert,
  IconDatabase,
  IconMenu,
  IconMoon,
  IconSliders,
  IconSun,
} from "./components/Icons";
import {
  createConversation,
  deleteConversationRecord,
  loadConversations,
  loadSettings,
  loadTheme,
  persistSettings,
  persistTheme,
  saveConversation,
} from "./lib/storage";
import { formatBytes, makeTitle, uid } from "./lib/utils";
import type {
  ChatMessage,
  ChatRequestMessage,
  Conversation,
  ModelStatus,
  Settings,
  Stage,
  Theme,
  WorkerRequest,
  WorkerResponse,
} from "./lib/types";

const MODEL_NAME = "Qwen2.5-Coder-0.5B";

type ToastTone = "info" | "warning" | "error";

interface Toast {
  id: string;
  message: string;
  tone: ToastTone;
}

interface Progress {
  percent: number | null;
  loaded: number;
  total: number;
}

interface StreamState {
  conversationId: string;
  messageId: string;
  text: string;
}

interface SpeedSample {
  loaded: number;
  at: number;
  speed: number;
}

export default function App() {
  const [theme, setTheme] = createSignal<Theme>(loadTheme());
  const [settings, setSettings] = createSignal<Settings>(loadSettings());
  const [conversations, setConversations] = createSignal<Conversation[]>([]);
  const [activeId, setActiveId] = createSignal<string | null>(null);
  const [draft, setDraft] = createSignal("");

  const [modelStatus, setModelStatus] = createSignal<ModelStatus>("idle");
  const [loadError, setLoadError] = createSignal<string | null>(null);
  const [stage, setStage] = createSignal<Stage>("cache-check");
  const [progress, setProgress] = createSignal<Progress>({
    percent: null,
    loaded: 0,
    total: 0,
  });
  const [speed, setSpeed] = createSignal(0);
  const [cacheBytes, setCacheBytes] = createSignal(0);

  const [generating, setGenerating] = createSignal(false);
  const [stopping, setStopping] = createSignal(false);
  const [sidebarOpen, setSidebarOpen] = createSignal(false);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [toast, setToast] = createSignal<Toast | null>(null);

  let worker: Worker | null = null;
  let streamState: StreamState | null = null;
  let speedSample: SpeedSample = { loaded: 0, at: 0, speed: 0 };
  let toastTimer: ReturnType<typeof setTimeout> | undefined;

  const activeConversation = createMemo<Conversation | null>(() => {
    const list = conversations();
    if (!list.length) return null;
    return list.find((conversation) => conversation.id === activeId()) ?? list[0];
  });

  const activeMessages = createMemo(() => activeConversation()?.messages ?? []);

  const canSend = createMemo(
    () =>
      modelStatus() === "ready" &&
      !generating() &&
      draft().trim().length > 0 &&
      !!activeConversation(),
  );

  const headerSubtitle = () => {
    if (modelStatus() === "ready") return `${MODEL_NAME} · Q4_K_M · local`;
    if (modelStatus() === "loading") return "Loading the model…";
    if (modelStatus() === "error") return "Model unavailable";
    return "Starting up…";
  };

  createEffect(
    () => theme(),
    (value) => {
      document.documentElement.dataset.theme = value;
      persistTheme(value);
    },
  );

  onSettled(() => {
    worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = handleWorkerMessage;
    worker.onerror = (event) => {
      const message = event.message || "The model worker crashed.";
      setLoadError(message);
      setModelStatus("error");
      setStage("error");
      setGenerating(false);
      setStopping(false);
    };

    loadModel(settings().device);
    void hydrateConversations();

    const onGlobalKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        newChat();
      }
      if (event.key === "Escape") setSidebarOpen(false);
    };
    window.addEventListener("keydown", onGlobalKeyDown);

    return () => {
      window.removeEventListener("keydown", onGlobalKeyDown);
      if (toastTimer) clearTimeout(toastTimer);
      worker?.terminate();
      worker = null;
    };
  });

  async function hydrateConversations(): Promise<void> {
    const stored = await loadConversations();
    if (conversations().length > 0) return; // The user already started a chat.

    if (stored.length) {
      setConversations(stored);
      setActiveId(stored[0].id);
    } else {
      const conversation = createConversation();
      setConversations([conversation]);
      setActiveId(conversation.id);
    }
  }

  function showToast(message: string, tone: ToastTone = "info"): void {
    setToast({ message, tone, id: uid("toast") });
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => setToast(null), 6000);
  }

  function loadModel(device: Settings["device"] = settings().device): void {
    if (!worker) return;
    setModelStatus("loading");
    setLoadError(null);
    setStage("cache-check");
    setProgress({ percent: null, loaded: 0, total: 0 });
    setSpeed(0);
    speedSample = { loaded: 0, at: performance.now(), speed: 0 };
    const request: WorkerRequest = { type: "load", device };
    worker.postMessage(request);
  }

  function handleWorkerMessage(event: MessageEvent<WorkerResponse>): void {
    const message = event.data;

    switch (message.type) {
      case "stage":
        setStage(message.stage);
        break;

      case "progress": {
        const loaded = Number(message.loaded) || 0;
        const total = Number(message.total) || 0;
        setProgress({
          loaded,
          total,
          percent:
            typeof message.percent === "number"
              ? message.percent
              : total
                ? (loaded / total) * 100
                : null,
        });

        const now = performance.now();
        const elapsed = (now - speedSample.at) / 1000;
        if (elapsed > 0.45) {
          const delta = loaded - speedSample.loaded;
          if (delta >= 0) {
            const instant = delta / elapsed;
            const smoothed = speedSample.speed
              ? speedSample.speed * 0.65 + instant * 0.35
              : instant;
            speedSample = { loaded, at: now, speed: smoothed };
            setSpeed(smoothed);
          }
        }

        if (stage() === "cache-check") {
          setStage("downloading");
        }
        break;
      }

      case "cache":
        setCacheBytes(Number(message.bytes) || 0);
        break;

      case "cache-cleared":
        setCacheBytes(0);
        showToast("Model cache cleared. It will download again on the next reload.", "info");
        break;

      case "warning":
        showToast(message.message, "warning");
        break;

      case "ready":
        setModelStatus("ready");
        setStage("ready");
        setLoadError(null);
        setProgress((current) => ({
          percent: 100,
          loaded: current.total || current.loaded,
          total: current.total || current.loaded,
        }));
        if (typeof message.cachedBytes === "number") setCacheBytes(message.cachedBytes);
        break;

      case "token": {
        if (!streamState || streamState.messageId !== message.id) break;
        streamState.text += message.text ?? "";
        const { conversationId, messageId, text } = streamState;

        setConversations((list) =>
          list.map((conversation) =>
            conversation.id !== conversationId
              ? conversation
              : {
                  ...conversation,
                  messages: conversation.messages.map((item) =>
                    item.id !== messageId ? item : { ...item, content: text },
                  ),
                },
          ),
        );
        break;
      }

      case "done": {
        const finished = streamState;
        if (!finished || finished.messageId !== message.id) break;

        const finalText =
          typeof message.text === "string" && message.text.length > 0
            ? message.text
            : finished.text;

        setConversations((list) =>
          list.map((conversation) =>
            conversation.id !== finished.conversationId
              ? conversation
              : {
                  ...conversation,
                  updatedAt: Date.now(),
                  messages: conversation.messages.map((item) =>
                    item.id !== finished.messageId
                      ? item
                      : {
                          ...item,
                          content: finalText,
                          streaming: false,
                          stopped: !!message.stopped,
                          meta: {
                            tokens: Number(message.tokens) || 0,
                            elapsed: Number(message.elapsed) || 0,
                          },
                        },
                  ),
                },
          ),
        );

        streamState = null;
        setGenerating(false);
        setStopping(false);
        schedulePersist(finished.conversationId);
        break;
      }

      case "error": {
        if (message.scope === "load") {
          setLoadError(message.message);
          setModelStatus("error");
          setStage("error");
          setGenerating(false);
          setStopping(false);
          break;
        }

        const failed = streamState;
        if (failed && failed.messageId === message.id) {
          setConversations((list) =>
            list.map((conversation) =>
              conversation.id !== failed.conversationId
                ? conversation
                : {
                    ...conversation,
                    updatedAt: Date.now(),
                    messages: conversation.messages.map((item) =>
                      item.id !== failed.messageId
                        ? item
                        : {
                            ...item,
                            content: failed.text,
                            streaming: false,
                            error: message.message,
                          },
                    ),
                  },
            ),
          );
          streamState = null;
          setGenerating(false);
          setStopping(false);
          schedulePersist(failed.conversationId);
        } else {
          showToast(message.message, "error");
        }
        break;
      }

      default:
        break;
    }
  }

  function schedulePersist(conversationId: string): void {
    setTimeout(() => {
      const conversation = conversations().find((item) => item.id === conversationId);
      if (conversation) void saveConversation(conversation);
    }, 0);
  }

  function sendMessage(): void {
    if (!canSend() || !worker) return;

    const conversation = activeConversation();
    if (!conversation) return;

    const text = draft().trim();
    if (!text) return;

    const userMessage: ChatMessage = {
      id: uid("msg"),
      role: "user",
      content: text,
      createdAt: Date.now(),
    };

    const assistantMessage: ChatMessage = {
      id: uid("msg"),
      role: "assistant",
      content: "",
      createdAt: Date.now(),
      streaming: true,
    };

    const history: ChatRequestMessage[] = conversation.messages
      .filter(
        (item) =>
          !item.streaming &&
          !item.error &&
          (item.role === "user" || (item.role === "assistant" && item.content)),
      )
      .map((item) => ({ role: item.role, content: item.content }));

    const requestMessages: ChatRequestMessage[] = [...history, { role: "user", content: text }];
    const systemPrompt = settings().systemPrompt?.trim();
    if (systemPrompt) requestMessages.unshift({ role: "system", content: systemPrompt });

    const updated: Conversation = {
      ...conversation,
      title:
        conversation.messages.length === 0 ? makeTitle(text) : conversation.title,
      updatedAt: Date.now(),
      messages: [...conversation.messages, userMessage, assistantMessage],
    };

    setConversations((list) =>
      list.map((item) => (item.id === updated.id ? updated : item)),
    );
    setActiveId(updated.id);
    setDraft("");
    setGenerating(true);
    setStopping(false);
    streamState = {
      conversationId: updated.id,
      messageId: assistantMessage.id,
      text: "",
    };

    void saveConversation(updated);

    const request: WorkerRequest = {
      type: "generate",
      id: assistantMessage.id,
      messages: requestMessages,
      options: {
        maxNewTokens: settings().maxNewTokens,
        temperature: settings().temperature,
        topP: settings().topP,
        repetitionPenalty: settings().repetitionPenalty,
      },
    };
    worker.postMessage(request);
  }

  function stopGeneration(): void {
    if (!worker || !generating() || stopping()) return;
    setStopping(true);
    const request: WorkerRequest = { type: "abort" };
    worker.postMessage(request);
  }

  function newChat(): void {
    const conversation = createConversation();
    setConversations((list) => [conversation, ...list]);
    setActiveId(conversation.id);
    setDraft("");
    setSidebarOpen(false);
  }

  function selectConversation(id: string): void {
    setActiveId(id);
    setDraft("");
    setSidebarOpen(false);
  }

  async function removeConversation(id: string): Promise<void> {
    if (streamState?.conversationId === id) {
      const request: WorkerRequest = { type: "abort" };
      worker?.postMessage(request);
      streamState = null;
      setGenerating(false);
      setStopping(false);
    }

    const remaining = conversations().filter((item) => item.id !== id);

    if (remaining.length === 0) {
      const fresh = createConversation();
      setConversations([fresh]);
      setActiveId(fresh.id);
    } else {
      setConversations(remaining);
      if (activeId() === id) setActiveId(remaining[0].id);
    }

    await deleteConversationRecord(id);
  }

  function saveSettings(next: Settings): void {
    const previous = settings();
    setSettings(next);
    persistSettings(next);
    setSettingsOpen(false);

    if (next.device !== previous.device) {
      if (generating()) {
        showToast("Stop the current response before switching the compute backend.", "warning");
      } else {
        loadModel(next.device);
      }
    }
  }

  function clearCache(): void {
    if (modelStatus() === "loading") {
      showToast("Wait for the model to finish loading before clearing the cache.", "warning");
      return;
    }

    const confirmed = window.confirm(
      "Delete the cached model file from browser storage (OPFS)?\n\nThe current chat keeps working until you reload. Next time, the ~398 MB Q4_K_M model will download again.",
    );
    if (!confirmed) return;
    const request: WorkerRequest = { type: "clear-cache" };
    worker?.postMessage(request);
  }

  function pickPrompt(prompt: string): void {
    if (modelStatus() !== "ready") return;
    setDraft(prompt);
    requestAnimationFrame(() => {
      document.querySelector<HTMLTextAreaElement>(".composer-input")?.focus();
    });
  }

  return (
    <div class="app">
      <Sidebar
        conversations={conversations()}
        activeId={activeId()}
        open={sidebarOpen()}
        modelStatus={modelStatus()}
        cacheBytes={cacheBytes()}
        progressPercent={progress().percent}
        progressLoaded={progress().loaded}
        progressTotal={progress().total}
        onNewChat={newChat}
        onSelect={selectConversation}
        onDelete={(id) => void removeConversation(id)}
        onOpenSettings={() => setSettingsOpen(true)}
        onClearCache={clearCache}
        onRetry={() => loadModel(settings().device)}
      />

      <Show when={sidebarOpen()}>
        <div class="scrim" onClick={() => setSidebarOpen(false)} />
      </Show>

      <main class="main">
        <header class="topbar">
          <button
            type="button"
            class="icon-button topbar-menu"
            aria-label="Open chats"
            onClick={() => setSidebarOpen(true)}
          >
            <IconMenu size={19} />
          </button>

          <div class="topbar-title">
            <div class="topbar-line">
              <span
                class={[
                  "status-dot",
                  {
                    "status-dot--ready": modelStatus() === "ready",
                    "status-dot--loading": modelStatus() === "loading",
                    "status-dot--error": modelStatus() === "error",
                  },
                ]}
              />
              <h2>{activeConversation()?.title ?? "New chat"}</h2>
            </div>
            <p>{headerSubtitle()}</p>
          </div>

          <div class="topbar-actions">
            <Show when={cacheBytes() > 0}>
              <span class="cache-chip" title="Model file cached in browser storage (OPFS)">
                <IconDatabase size={13} />
                {formatBytes(cacheBytes())}
              </span>
            </Show>

            <button
              type="button"
              class="icon-button"
              aria-label={theme() === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              title={theme() === "dark" ? "Light mode" : "Dark mode"}
              onClick={() => setTheme(theme() === "dark" ? "light" : "dark")}
            >
              <Show when={theme() === "dark"} fallback={<IconMoon size={18} />}>
                <IconSun size={18} />
              </Show>
            </button>

            <button
              type="button"
              class="icon-button"
              aria-label="Open settings"
              title="Settings"
              onClick={() => setSettingsOpen(true)}
            >
              <IconSliders size={18} />
            </button>
          </div>
        </header>

        <ChatView messages={activeMessages()} onPick={pickPrompt} />

        <Composer
          value={draft()}
          modelStatus={modelStatus()}
          generating={generating()}
          stopping={stopping()}
          canSend={canSend()}
          onInput={setDraft}
          onSend={sendMessage}
          onStop={stopGeneration}
        />
      </main>

      <Show when={settingsOpen()}>
        <SettingsDialog
          settings={settings()}
          cacheBytes={cacheBytes()}
          busy={generating()}
          onClose={() => setSettingsOpen(false)}
          onSave={saveSettings}
          onClearCache={clearCache}
        />
      </Show>

      <LoadingOverlay
        open={modelStatus() !== "ready"}
        error={loadError()}
        stage={stage()}
        percent={progress().percent}
        loaded={progress().loaded}
        total={progress().total}
        speed={speed()}
        cachedBytes={cacheBytes()}
        onRetry={() => loadModel(settings().device)}
      />

      <Show when={toast()}>
        <div class={["toast", `toast--${toast()!.tone}`]} role="status">
          <Show when={toast()!.tone === "warning" || toast()!.tone === "error"}>
            <IconAlert size={15} />
          </Show>
          <span>{toast()!.message}</span>
        </div>
      </Show>
    </div>
  );
}
