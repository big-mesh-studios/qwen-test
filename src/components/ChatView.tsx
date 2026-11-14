import { createEffect, For, Show, type Component } from "solid-js";
import { Dynamic } from "@solidjs/web";
import type { ChatMessage as ChatMessageModel } from "../lib/types";
import { ChatMessage } from "./ChatMessage";
import {
  IconBook,
  IconBug,
  IconCode,
  IconDatabase,
  IconSparkles,
  type IconProps,
} from "./Icons";

interface Suggestion {
  icon: Component<IconProps>;
  title: string;
  description: string;
  prompt: string;
}

const SUGGESTIONS: Suggestion[] = [
  {
    icon: IconCode,
    title: "Build a debounce hook",
    description: "A typed, reusable React hook with cleanup.",
    prompt:
      "Write a reusable TypeScript React hook that debounces a value. Explain how the cleanup works.",
  },
  {
    icon: IconBook,
    title: "Explain this code",
    description: "Walk through a tricky one-liner.",
    prompt:
      "Explain what this JavaScript does, step by step:\n\n```js\nconst x = arr.reduce((a, b) => (a[b] = (a[b] || 0) + 1, a), {});\n```",
  },
  {
    icon: IconBug,
    title: "Find the bug",
    description: "Spot an async mistake and fix it.",
    prompt:
      "Why might this code log the wrong value? Give a corrected version.\n\n```js\nfor (var i = 0; i < 3; i++) {\n  setTimeout(() => console.log(i), 100);\n}\n```",
  },
  {
    icon: IconDatabase,
    title: "Write a SQL query",
    description: "Turn a question into clean SQL.",
    prompt:
      "Write a SQL query that returns the top 5 customers by total revenue, including their country and order count. Use a customers table and an orders table.",
  },
];

interface ChatViewProps {
  messages: ChatMessageModel[];
  onPick: (prompt: string) => void;
}

export function ChatView(props: ChatViewProps) {
  let scroller: HTMLDivElement | undefined;
  let pinned = true;
  let lastLength = 0;

  const onScroll = () => {
    if (!scroller) return;
    pinned = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 140;
  };

  createEffect(
    () => ({
      length: props.messages.length,
      tail: props.messages.at(-1)?.content ?? "",
      streaming: !!props.messages.at(-1)?.streaming,
    }),
    (value) => {
      // Read `tail`/`streaming` so the effect tracks token updates too.
      void value.tail;
      void value.streaming;
      if (value.length !== lastLength) {
        lastLength = value.length;
        pinned = true;
      }
      if (pinned && scroller) {
        requestAnimationFrame(() => {
          if (scroller) scroller.scrollTop = scroller.scrollHeight;
        });
      }
    },
  );

  return (
    <div class="chat-scroll" ref={(el) => (scroller = el)} onScroll={onScroll}>
      <div class="chat-thread">
        <Show
          when={props.messages.length > 0}
          fallback={<EmptyState onPick={props.onPick} />}
        >
          <For each={props.messages} keyed={(message) => message.id}>
            {(message) => <ChatMessage message={message()} />}
          </For>
          <div class="thread-spacer" />
        </Show>
      </div>
    </div>
  );
}

function EmptyState(props: { onPick: (prompt: string) => void }) {
  return (
    <section class="empty-state">
      <div class="hero-mark" aria-hidden="true">
        <IconSparkles size={30} />
      </div>

      <p class="eyebrow">
        <span class="eyebrow-dot" />
        Qwen2.5-Coder · 0.5B · q4 · local
      </p>

      <h1>
        What should we <span class="gradient-text">build</span>?
      </h1>

      <p class="hero-copy">
        A tiny coding model that runs entirely in your browser. No API keys, no server, no data
        leaving this tab.
      </p>

      <div class="suggestions">
        <For each={SUGGESTIONS}>
          {(suggestion) => (
            <button
              type="button"
              class="suggestion"
              onClick={() => props.onPick(suggestion.prompt)}
            >
              <span class="suggestion-icon">
                <Dynamic component={suggestion.icon} size={17} />
              </span>
              <span class="suggestion-text">
                <strong>{suggestion.title}</strong>
                <span>{suggestion.description}</span>
              </span>
            </button>
          )}
        </For>
      </div>

      <p class="hero-foot">
        First run downloads the model (~862 MB). It is cached in IndexedDB for instant offline
        starts next time.
      </p>
    </section>
  );
}
