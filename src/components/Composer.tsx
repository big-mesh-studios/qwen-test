import { createEffect, Show } from "solid-js";
import type { ModelStatus } from "../lib/types";
import { IconSend, IconShield, IconStop } from "./Icons";

interface ComposerProps {
  value: string;
  modelStatus: ModelStatus;
  generating: boolean;
  stopping: boolean;
  canSend: boolean;
  onInput: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
}

export function Composer(props: ComposerProps) {
  let textarea: HTMLTextAreaElement | undefined;

  createEffect(
    () => props.value,
    () => {
      if (!textarea) return;
      textarea.style.height = "0px";
      textarea.style.height = `${Math.min(200, Math.max(24, textarea.scrollHeight))}px`;
    },
  );

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      if (props.canSend) props.onSend();
    }
  };

  const placeholder = () => {
    if (props.modelStatus === "ready") return "Ask Qwen to build something…";
    if (props.modelStatus === "error") return "Model failed to load — open settings to retry";
    return "Loading the model…";
  };

  return (
    <div class="composer-wrap">
      <div class={["composer", { "composer--busy": props.generating }]}>
        <textarea
          ref={(el) => (textarea = el)}
          class="composer-input"
          rows="1"
          value={props.value}
          placeholder={placeholder()}
          disabled={props.modelStatus !== "ready"}
          onInput={(event) => props.onInput(event.currentTarget.value)}
          onKeyDown={onKeyDown}
          aria-label="Message Qwen Coder"
        />

        <Show
          when={props.generating}
          fallback={
            <button
              type="button"
              class="send-button"
              disabled={!props.canSend}
              onClick={props.onSend}
              aria-label="Send message"
              title="Send message"
            >
              <IconSend size={18} />
            </button>
          }
        >
          <button
            type="button"
            class="send-button send-button--stop"
            disabled={props.stopping}
            onClick={props.onStop}
            aria-label="Stop generating"
            title="Stop generating"
          >
            <Show when={!props.stopping} fallback={<span class="stop-spinner" />}>
              <IconStop size={16} />
            </Show>
          </button>
        </Show>
      </div>

      <div class="composer-foot">
        <span class="composer-hint">
          <kbd>Enter</kbd> to send <span class="dot-sep">·</span> <kbd>Shift</kbd> +{" "}
          <kbd>Enter</kbd> for a new line
        </span>
        <span class="composer-private">
          <IconShield size={12} />
          Runs locally
        </span>
      </div>
    </div>
  );
}
