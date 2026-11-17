import assert from "node:assert/strict";
import { createMemo, createRoot, createSignal, flush, mapArray } from "solid-js";

/**
 * Mirrors ChatView's Solid 2.0 usage:
 *
 *   <For each={props.messages} keyed={(message) => message.id}>
 *     {(message) => <ChatMessage message={message()} />}
 *   </For>
 *
 * App replaces the conversation/message objects on every token. This checks
 * that the keyed row accessor receives those replacements (and does not freeze
 * on the first item) when the id stays the same.
 */
function checkKeyedRowUpdates() {
  const conversation = {
    id: "chat_1",
    messages: [{ id: "msg_1", content: "" }],
  };

  createRoot(() => {
    const [conversations, setConversations] = createSignal([conversation]);
    const activeMessages = createMemo(() => conversations()[0].messages);

    let row;
    const rows = mapArray(
      activeMessages,
      (message) => {
        row = message;
        return message();
      },
      { keyed: (message) => message.id },
    );

    rows();
    assert.equal(row().content, "");

    setConversations([
      {
        ...conversation,
        messages: [{ ...conversation.messages[0], content: "hello" }],
      },
    ]);
    flush();
    rows();
    assert.equal(row().content, "hello");

    setConversations([
      {
        ...conversation,
        messages: [{ ...conversation.messages[0], content: "hello world" }],
      },
    ]);
    flush();
    rows();
    assert.equal(row().content, "hello world");
  });
}

checkKeyedRowUpdates();
console.log("reactivity check passed: keyed message rows receive streamed updates");
