import {
  createEffect,
  createMemo,
  createSignal,
  onSettled,
  Show,
} from "solid-js";
import { ChatView } from "./components/ChatView.jsx";
import { Composer } from "./components/Composer.jsx";
import { LoadingOverlay } from "./components/LoadingOverlay.jsx";
import { SettingsDialog } from "./components/SettingsDialog.jsx";
import { Sidebar } from "./components/Sidebar.jsx";
import {
  IconAlert,
  IconDatabase,
  IconMenu,
  IconMoon,
  IconSliders,
  IconSun,
} from "./components/Icons.jsx";
import {
  createConversation,
  deleteConversationRecord,
  loadConversations,
  loadSettings,
  loadTheme,
  persistSettings,
  persistTheme,
  saveConversation,
} from "./lib/storage.js";
import { formatBytes, makeTitle, uid } from "./lib/utils.js";

const MODEL_NAME = "Qwen2.5-Coder-0.5B";

export default function App() {
  const [theme, setTheme] = createSignal(loadTheme());
  const [settings, setSettings] = createSignal(loadSettings());
  const [conversations, setConversations] = createSignal([]);
  const [activeId, setActiveId] = createSignal(null);
  const [draft, setDraft] = createSignal("");

  const [modelStatus, setModelStatus] = createSignal("idle");
  const [loadError, setLoadError] = createSignal(null);
  const [stage, setStage] = createSignal("cache-check");
  const [progress, setProgress] = createSignal({ percent: null, loaded: 0, total: 0 });
  const [speed, setSpeed] = createSignal(0);
  const [cacheBytes, setCacheBytes] = createSignal(0);
  const [cacheWarning, setCacheWarning] = createSignal(null);

  const [generating, setGenerating] = createSignal(false);
  const [stopping, setStopping] = createSignal(false);
  const [sidebarOpen, setSidebarOpen] = createSignal(false);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [toast, setToast] = createSignal(null);

  let worker = null;
  let streamState = null;
  let speedSample = { loaded: 0, at: 0, speed: 0 };
  let toastTimer;

  const activeConversation = createMemo(() => {
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
    if (modelStatus() === "ready") return `${MODEL_NAME} · q4 · local`;
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
    worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
    worker.onmessage = handleWorkerMessage;
    worker.onerror = (event) => {
      const message = event.message || "The model worker crashed.";
      setLoadError(message);
      setModelStatus("error");
      setStage("error");
      setGenerating(false);
      setStopping(false);
    };

    loadModel(settings().device, settings().dtype);
    hydrateConversations();

    const onGlobalKeyDown = (event) => {
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

  async function hydrateConversations() {
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

  function showToast(message, tone = "info") {
    setToast({ message, tone, id: uid("toast") });
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => setToast(null), 6000);
  }

  function loadModel(device = settings().device, dtype = settings().dtype) {
    if (!worker) return;
    setModelStatus("loading");
    setLoadError(null);
    setStage("cache-check");
    setProgress({ percent: null, loaded: 0, total: 0 });
    setSpeed(0);
    speedSample = { loaded: 0, at: performance.now(), speed: 0 };
    worker.postMessage({ type: "load", device, dtype });
  }

  function handleWorkerMessage(event) {
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

        if (stage() === "cache-check" || stage() === "downloading") {
          setStage("downloading");
        }
        break;
      }

      case "caching":
        if (message.phase === "start") setStage("caching");
        break;

      case "cache":
        setCacheBytes(Number(message.bytes) || 0);
        break;

      case "cache-error":
        setCacheWarning(message.message);
        showToast(message.message, "warning");
        break;

      case "cache-cleared":
        setCacheBytes(0);
        setCacheWarning(null);
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

  function schedulePersist(conversationId) {
    setTimeout(() => {
      const conversation = conversations().find((item) => item.id === conversationId);
      if (conversation) saveConversation(conversation);
    }, 0);
  }

  function sendMessage() {
    if (!canSend() || !worker) return;

    const conversation = activeConversation();
    if (!conversation) return;

    const text = draft().trim();
    if (!text) return;

    const userMessage = {
      id: uid("msg"),
      role: "user",
      content: text,
      createdAt: Date.now(),
    };

    const assistantMessage = {
      id: uid("msg"),
      role: "assistant",
      content: "",
      createdAt: Date.now(),
      streaming: true,
    };

    const history = conversation.messages
      .filter(
        (item) =>
          !item.streaming &&
          !item.error &&
          (item.role === "user" || (item.role === "assistant" && item.content)),
      )
      .map((item) => ({ role: item.role, content: item.content }));

    const requestMessages = [...history, { role: "user", content: text }];
    const systemPrompt = settings().systemPrompt?.trim();
    if (systemPrompt) requestMessages.unshift({ role: "system", content: systemPrompt });

    const updated = {
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

    saveConversation(updated);

    worker.postMessage({
      type: "generate",
      id: assistantMessage.id,
      messages: requestMessages,
      options: {
        maxNewTokens: settings().maxNewTokens,
        temperature: settings().temperature,
        topP: settings().topP,
        repetitionPenalty: settings().repetitionPenalty,
      },
    });
  }

  function stopGeneration() {
    if (!worker || !generating() || stopping()) return;
    setStopping(true);
    worker.postMessage({ type: "abort" });
  }

  function newChat() {
    const conversation = createConversation();
    setConversations((list) => [conversation, ...list]);
    setActiveId(conversation.id);
    setDraft("");
    setSidebarOpen(false);
  }

  function selectConversation(id) {
    setActiveId(id);
    setDraft("");
    setSidebarOpen(false);
  }

  async function removeConversation(id) {
    if (streamState?.conversationId === id) {
      worker?.postMessage({ type: "abort" });
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

  function saveSettings(next) {
    const previous = settings();
    setSettings(next);
    persistSettings(next);
    setSettingsOpen(false);

    if (next.device !== previous.device) {
      if (generating()) {
        showToast("Stop the current response before switching the compute backend.", "warning");
      } else {
        loadModel(next.device, next.dtype);
      }
    }
  }

  function clearCache() {
    if (modelStatus() === "loading") {
      showToast("Wait for the model to finish loading before clearing the cache.", "warning");
      return;
    }

    const confirmed = window.confirm(
      "Delete the cached model files from IndexedDB?\n\nThe chat keeps working until you reload. Next time, the ~862 MB model will download again.",
    );
    if (!confirmed) return;
    worker?.postMessage({ type: "clear-cache" });
  }

  function pickPrompt(prompt) {
    if (modelStatus() !== "ready") return;
    setDraft(prompt);
    requestAnimationFrame(() => {
      document.querySelector(".composer-input")?.focus();
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
        cacheWarning={cacheWarning()}
        progressPercent={progress().percent}
        progressLoaded={progress().loaded}
        progressTotal={progress().total}
        onNewChat={newChat}
        onSelect={selectConversation}
        onDelete={removeConversation}
        onOpenSettings={() => setSettingsOpen(true)}
        onClearCache={clearCache}
        onRetry={() => loadModel(settings().device, settings().dtype)}
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
              <span class="cache-chip" title="Model files cached in IndexedDB">
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
        onRetry={() => loadModel(settings().device, settings().dtype)}
      />

      <Show when={toast()}>
        <div class={["toast", `toast--${toast().tone}`]} role="status">
          <Show when={toast().tone === "warning" || toast().tone === "error"}>
            <IconAlert size={15} />
          </Show>
          <span>{toast().message}</span>
        </div>
      </Show>
    </div>
  );
}
