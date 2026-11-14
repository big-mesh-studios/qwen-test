import { createMemo, Match, Repeat, Switch } from "solid-js";
import { parseInline, parseMarkdown } from "../lib/markdown.js";
import { CodeBlock } from "./CodeBlock.jsx";

function TextWithBreaks(props) {
  const parts = createMemo(() => String(props.text ?? "").split("\n"));

  return (
    <Repeat count={parts().length}>
      {(i) => (
        <>
          {parts()[i]}
          {i < parts().length - 1 ? <br /> : null}
        </>
      )}
    </Repeat>
  );
}

function InlineNode(props) {
  return (
    <Switch fallback={<TextWithBreaks text={props.node.text} />}>
      <Match when={props.node.type === "code"}>
        <code class="inline-code">{props.node.text}</code>
      </Match>
      <Match when={props.node.type === "link"}>
        <a href={props.node.href} target="_blank" rel="noreferrer noopener">
          {props.node.text}
        </a>
      </Match>
      <Match when={props.node.type === "strong"}>
        <strong>
          <Inline text={props.node.text} depth={(props.depth ?? 0) + 1} />
        </strong>
      </Match>
      <Match when={props.node.type === "em"}>
        <em>
          <Inline text={props.node.text} depth={(props.depth ?? 0) + 1} />
        </em>
      </Match>
    </Switch>
  );
}

function Inline(props) {
  const depth = () => props.depth ?? 0;
  const nodes = createMemo(() => (depth() > 2 ? [] : parseInline(props.text)));

  return (
    <Switch fallback={<TextWithBreaks text={props.text} />}>
      <Match when={depth() <= 2}>
        <Repeat count={nodes().length}>
          {(i) => <InlineNode node={nodes()[i]} depth={depth()} />}
        </Repeat>
      </Match>
    </Switch>
  );
}

function Block(props) {
  return (
    <Switch fallback={<p><Inline text={props.block.text ?? ""} /></p>}>
      <Match when={props.block.type === "code"}>
        <CodeBlock lang={props.block.lang} code={props.block.code} />
      </Match>

      <Match when={props.block.type === "heading"}>
        {props.block.level === 1 ? (
          <h1><Inline text={props.block.text} /></h1>
        ) : props.block.level === 2 ? (
          <h2><Inline text={props.block.text} /></h2>
        ) : (
          <h3><Inline text={props.block.text} /></h3>
        )}
      </Match>

      <Match when={props.block.type === "list"}>
        {props.block.ordered ? (
          <ol class="md-list">
            <Repeat count={props.block.items.length}>
              {(i) => <li><Inline text={props.block.items[i]} /></li>}
            </Repeat>
          </ol>
        ) : (
          <ul class="md-list">
            <Repeat count={props.block.items.length}>
              {(i) => <li><Inline text={props.block.items[i]} /></li>}
            </Repeat>
          </ul>
        )}
      </Match>

      <Match when={props.block.type === "quote"}>
        <blockquote>
          <Inline text={props.block.text} />
        </blockquote>
      </Match>

      <Match when={props.block.type === "hr"}>
        <hr class="md-rule" />
      </Match>
    </Switch>
  );
}

export function Markdown(props) {
  const blocks = createMemo(() => parseMarkdown(props.content));

  return (
    <div class="md">
      <Repeat count={blocks().length}>{(i) => <Block block={blocks()[i]} />}</Repeat>
    </div>
  );
}
