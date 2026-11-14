import { For, Show } from "solid-js";
import {
  IconAlert,
  IconCpu,
  IconDatabase,
  IconPlus,
  IconRefresh,
  IconShield,
  IconSliders,
  IconTrash,
} from "./Icons.jsx";
import { formatBytes, previewText, relativeTime } from "../lib/utils.js";

function ConversationItem(props) {
  return (
    <div
      class={["chat-item", { "chat-item--active": props.active }]}
      role="button"
      tabindex="0"
      onClick={() => props.onSelect(props.conversation.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          props.onSelect(props.conversation.id);
        }
      }}
    >
      <div class="chat-item-main">
        <div class="chat-item-title">{props.conversation.title}</div>
        <div class="chat-item-preview">{previewText(props.conversation.messages.at(-1)?.content)}</div>
      </div>
      <span class="chat-item-time">{relativeTime(props.conversation.updatedAt)}</span>
      <button
        type="button"
        class="chat-item-delete"
        aria-label="Delete chat"
        title="Delete chat"
        onClick={(event) => {
          event.stopPropagation();
          props.onDelete(props.conversation.id);
        }}
      >
        <IconTrash size={14} />
      </button>
    </div>
  );
}

export function Sidebar(props) {
  const statusLabel = () => {
    switch (props.modelStatus) {
      case "ready":
        return "Model ready";
      case "loading":
        return "Loading model";
      case "error":
        return "Model failed";
      default:
        return "Starting up";
    }
  };

  return (
    <aside class={["sidebar", { "sidebar--open": props.open }]}>
      <div class="sidebar-head">
        <div class="brand">
          <span class="brand-mark" aria-hidden="true">
            <span class="brand-braces">{"{ }"}</span>
          </span>
          <span class="brand-text">
            <strong>Qwen Coder</strong>
            <span>local chat</span>
          </span>
        </div>
      </div>

      <button type="button" class="new-chat" onClick={props.onNewChat}>
        <IconPlus size={17} />
        <span>New chat</span>
        <kbd>⌘K</kbd>
      </button>

      <div class="sidebar-section">
        <div class="section-label">
          <span>Chats</span>
          <span class="section-count">{props.conversations.length}</span>
        </div>

        <div class="chat-list">
          <Show
            when={props.conversations.length > 0}
            fallback={
              <div class="chats-empty">
                <IconMessageSmall />
                <span>Your chats will show up here.</span>
              </div>
            }
          >
            <For each={props.conversations} keyed={(conversation) => conversation.id}>
              {(conversation) => (
                <ConversationItem
                  conversation={conversation()}
                  active={conversation().id === props.activeId}
                  onSelect={props.onSelect}
                  onDelete={props.onDelete}
                />
              )}
            </For>
          </Show>
        </div>
      </div>

      <div class="sidebar-foot">
        <div class="model-card">
          <div class="model-card-top">
            <span
              class={[
                "status-dot",
                {
                  "status-dot--ready": props.modelStatus === "ready",
                  "status-dot--loading": props.modelStatus === "loading",
                  "status-dot--error": props.modelStatus === "error",
                },
              ]}
            />
            <span class="model-status-text">{statusLabel()}</span>
            <Show when={props.modelStatus === "ready"}>
              <span class="cache-pill">
                <IconDatabase size={11} />
                {formatBytes(props.cacheBytes)}
              </span>
            </Show>
          </div>

          <div class="model-card-name">
            <IconCpu size={15} />
            <span>Qwen2.5-Coder-0.5B</span>
          </div>
          <div class="model-card-meta">Q4 · 4-bit · runs in your browser</div>

          <Show when={props.modelStatus === "loading"}>
            <div class="mini-progress">
              <div
                class={["mini-progress-bar", { "mini-progress-bar--indeterminate": !props.progressPercent }]}
                style={{ width: `${Math.max(4, props.progressPercent || 0)}%` }}
              />
            </div>
            <div class="model-card-hint">
              {props.progressPercent
                ? `${Math.round(props.progressPercent)}% · ${formatBytes(props.progressLoaded)} / ${formatBytes(props.progressTotal)}`
                : "Preparing model…"}
            </div>
          </Show>

          <Show when={props.modelStatus === "error"}>
            <div class="model-card-error">
              <IconAlert size={13} />
              <span>Could not load the model.</span>
            </div>
            <button type="button" class="model-retry" onClick={props.onRetry}>
              <IconRefresh size={13} />
              Retry load
            </button>
          </Show>

          <Show when={props.cacheWarning}>
            <div class="model-card-warning">{props.cacheWarning}</div>
          </Show>

          <div class="model-card-actions">
            <button type="button" onClick={props.onOpenSettings}>
              <IconSliders size={13} />
              Settings
            </button>
            <Show when={props.cacheBytes > 0}>
              <button type="button" onClick={props.onClearCache}>
                <IconTrash size={13} />
                Clear cache
              </button>
            </Show>
          </div>
        </div>

        <div class="local-note">
          <IconShield size={13} />
          <span>
            Private by design. <strong>Nothing leaves this device.</strong>
          </span>
        </div>
      </div>
    </aside>
  );
}

function IconMessageSmall() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V6a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
    </svg>
  );
}
