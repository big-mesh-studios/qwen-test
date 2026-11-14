import { createSignal, onSettled, Show } from "solid-js";
import { formatDuration, formatTime } from "../lib/utils";
import type { ChatMessage as ChatMessageModel } from "../lib/types";
import { IconAlert, IconCheck, IconCode, IconCopy } from "./Icons";
import { Markdown } from "./Markdown";

interface ChatMessageProps {
  message: ChatMessageModel;
}

export function ChatMessage(props: ChatMessageProps) {
  const [copied, setCopied] = createSignal(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  onSettled(() => () => {
    if (timer) clearTimeout(timer);
  });

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(props.message.content);
      setCopied(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard permission denied – nothing useful to show.
    }
  };

  return (
    <article
      class={["message", props.message.role === "user" ? "message--user" : "message--assistant"]}
    >
      <Show when={props.message.role === "assistant"}>
        <div class="avatar avatar--ai" aria-hidden="true">
          <IconCode size={15} />
        </div>
      </Show>

      <div class="message-body">
        <Show
          when={props.message.role === "user"}
          fallback={
            <div class="assistant-content">
              <Show when={props.message.content}>
                <Markdown content={props.message.content} streaming={props.message.streaming} />
              </Show>

              <Show when={props.message.streaming && !props.message.content}>
                <div class="thinking">
                  <span class="thinking-dot" />
                  <span class="thinking-dot" />
                  <span class="thinking-dot" />
                  <span class="thinking-label">Thinking</span>
                </div>
              </Show>

              <Show when={props.message.error}>
                <div class="message-error">
                  <IconAlert size={15} />
                  <span>{props.message.error}</span>
                </div>
              </Show>
            </div>
          }
        >
          <div class="user-bubble">{props.message.content}</div>
        </Show>

        <div class="message-meta">
          <span>{formatTime(props.message.createdAt)}</span>

          <Show when={props.message.role === "assistant" && props.message.streaming}>
            <span class="meta-sep">·</span>
            <span class="meta-live">generating</span>
          </Show>

          <Show when={props.message.role === "assistant" && props.message.stopped}>
            <span class="meta-sep">·</span>
            <span>stopped</span>
          </Show>

          <Show when={props.message.role === "assistant" && props.message.meta?.tokens}>
            <span class="meta-sep">·</span>
            <span>{props.message.meta?.tokens} tokens</span>
            <Show when={props.message.meta?.elapsed}>
              <span class="meta-sep">·</span>
              <span>{formatDuration(props.message.meta?.elapsed ?? 0)}</span>
            </Show>
          </Show>

          <Show when={props.message.role === "assistant" && props.message.content}>
            <button
              type="button"
              class="message-copy"
              onClick={onCopy}
              aria-label="Copy message"
            >
              <Show when={copied()} fallback={<IconCopy size={13} />}>
                <IconCheck size={13} />
              </Show>
              <span>{copied() ? "Copied" : "Copy"}</span>
            </button>
          </Show>
        </div>
      </div>
    </article>
  );
}
