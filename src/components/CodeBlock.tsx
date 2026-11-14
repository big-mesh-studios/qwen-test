import { createSignal, onSettled, Show } from "solid-js";
import { IconCheck, IconCopy } from "./Icons";

interface CodeBlockProps {
  code: string;
  lang?: string;
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall back to a temporary textarea (non-secure contexts).
  }

  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
    return true;
  } catch {
    return false;
  }
}

export function CodeBlock(props: CodeBlockProps) {
  const [copied, setCopied] = createSignal(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  onSettled(() => () => {
    if (timer) clearTimeout(timer);
  });

  const onCopy = async () => {
    const ok = await copyText(props.code);
    if (!ok) return;
    setCopied(true);
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div class="code-block">
      <div class="code-head">
        <span class="code-lang">{props.lang || "code"}</span>
        <button
          type="button"
          class="code-copy"
          onClick={onCopy}
          aria-label={copied() ? "Copied" : "Copy code"}
        >
          <Show when={copied()} fallback={<IconCopy size={13} />}>
            <IconCheck size={13} />
          </Show>
          <span>{copied() ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <pre class="code-body">
        <code>{props.code}</code>
      </pre>
    </div>
  );
}
